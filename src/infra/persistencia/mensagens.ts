import { COLUNA_LEAD_ID, TABELA_LEADS, TABELA_MENSAGENS } from './constants.js';
import { ConflitoUnicoError, PersistenciaError, ValidacaoPersistenciaError } from './errors.js';
import { resolverLead } from './leads.js';
import { normalizarTelefone } from './telefone.js';
import type {
  MensagemPersistida,
  PersistenciaDependencies,
  RegistrarMensagemInput,
  RegistrarMensagemOutput,
} from './types.js';

async function buscarPorWaMessageId(
  deps: PersistenciaDependencies,
  waMessageId: string,
): Promise<MensagemPersistida | null> {
  try {
    return await deps.cliente.selecionarUm<MensagemPersistida>(TABELA_MENSAGENS, {
      wa_message_id: waMessageId,
    });
  } catch (error) {
    throw new PersistenciaError(`Falha ao buscar mensagem ${waMessageId}.`, TABELA_MENSAGENS, {
      cause: error,
    });
  }
}

/**
 * Persiste a mensagem sempre com `lead_id` = UUID de `leads(id)`. Gravar os
 * dígitos do telefone nessa coluna viola a FK e faz a mensagem nunca aparecer
 * na tela de conversa.
 *
 * É idempotente quando `waMessageId` é informado: o WaSender reentrega webhooks
 * e a mesma mensagem não pode aparecer duas vezes na conversa.
 */
export async function registrarMensagem(
  deps: PersistenciaDependencies,
  input: RegistrarMensagemInput,
): Promise<RegistrarMensagemOutput> {
  const conteudo = input.conteudo.trim();

  if (conteudo.length === 0) {
    throw new ValidacaoPersistenciaError('Conteúdo da mensagem não pode ser vazio.');
  }

  const telefone = normalizarTelefone(input.telefone);
  const lead = await resolverLead(deps, telefone, input.nome);
  const agora = (deps.agora ?? (() => new Date()))();
  const waMessageId = input.waMessageId ?? null;

  if (waMessageId !== null) {
    const jaPersistida = await buscarPorWaMessageId(deps, waMessageId);

    if (jaPersistida !== null) {
      return { lead, mensagem: jaPersistida, duplicada: true };
    }
  }

  let mensagem: MensagemPersistida;

  try {
    mensagem = await deps.cliente.inserirUm<MensagemPersistida>(TABELA_MENSAGENS, {
      [COLUNA_LEAD_ID]: lead.id,
      direcao: input.direcao,
      conteudo,
      wa_message_id: waMessageId,
      criado_em: agora.toISOString(),
    });
  } catch (error) {
    // Reentrega concorrente do mesmo webhook: o índice único venceu a corrida.
    if (error instanceof ConflitoUnicoError && waMessageId !== null) {
      const concorrente = await buscarPorWaMessageId(deps, waMessageId);

      if (concorrente !== null) {
        return { lead, mensagem: concorrente, duplicada: true };
      }
    }

    throw new PersistenciaError(
      `Falha ao inserir mensagem do lead ${lead.id}.`,
      TABELA_MENSAGENS,
      { cause: error },
    );
  }

  try {
    await deps.cliente.atualizarPorId(TABELA_LEADS, lead.id, {
      ultima_mensagem: conteudo,
      ultima_interacao: agora.toISOString(),
    });
  } catch (error) {
    throw new PersistenciaError(
      `Falha ao atualizar última interação do lead ${lead.id}.`,
      TABELA_LEADS,
      { cause: error },
    );
  }

  return {
    lead: {
      ...lead,
      ultima_mensagem: conteudo,
      ultima_interacao: agora.toISOString(),
    },
    mensagem,
    duplicada: false,
  };
}

export async function listarMensagensDoLead(
  deps: PersistenciaDependencies,
  leadId: string,
): Promise<MensagemPersistida[]> {
  try {
    return await deps.cliente.selecionarTodos<MensagemPersistida>(
      TABELA_MENSAGENS,
      { [COLUNA_LEAD_ID]: leadId },
      { ordenacao: { coluna: 'criado_em', ascendente: true } },
    );
  } catch (error) {
    throw new PersistenciaError(
      `Falha ao listar mensagens do lead ${leadId}.`,
      TABELA_MENSAGENS,
      { cause: error },
    );
  }
}
