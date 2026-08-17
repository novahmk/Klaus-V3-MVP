import { COLUNA_TELEFONE, TABELA_LEADS } from './constants.js';
import { ConflitoUnicoError, PersistenciaError } from './errors.js';
import { criarLoggerPadrao } from './logger.js';
import { normalizarTelefone } from './telefone.js';
import type { Lead, PersistenciaDependencies } from './types.js';

/**
 * Busca o lead pela única chave de negócio que existe no banco: `telefone`.
 * A tabela `leads_dashboard` e a coluna `leads.lead_id` nunca existiram.
 */
export async function buscarLeadPorTelefone(
  deps: PersistenciaDependencies,
  telefone: string,
): Promise<Lead | null> {
  const telefoneNormalizado = normalizarTelefone(telefone);

  try {
    return await deps.cliente.selecionarUm<Lead>(TABELA_LEADS, {
      [COLUNA_TELEFONE]: telefoneNormalizado,
    });
  } catch (error) {
    throw new PersistenciaError(
      `Falha ao buscar lead por telefone ${telefoneNormalizado}.`,
      TABELA_LEADS,
      { cause: error },
    );
  }
}

/**
 * Garante um lead persistido para o telefone, criando-o quando ainda não
 * existe. É o pré-requisito de qualquer insert em `mensagens`, cuja coluna
 * `lead_id` é UUID NOT NULL com FK para `leads(id)`.
 */
export async function resolverLead(
  deps: PersistenciaDependencies,
  telefone: string,
  nome?: string,
): Promise<Lead> {
  const logger = deps.logger ?? criarLoggerPadrao();
  const telefoneNormalizado = normalizarTelefone(telefone);

  const existente = await buscarLeadPorTelefone(deps, telefoneNormalizado);

  if (existente !== null) {
    return existente;
  }

  logger.info('Lead inexistente, criando registro.', { telefone: telefoneNormalizado });

  try {
    return await deps.cliente.inserirUm<Lead>(TABELA_LEADS, {
      [COLUNA_TELEFONE]: telefoneNormalizado,
      nome: nome ?? null,
      controle_manual: false,
      estagio: 'abertura',
    });
  } catch (error) {
    // Corrida: dois webhooks do mesmo número chegaram juntos e o outro venceu.
    // O índice único em leads.telefone garante que exista exatamente um lead.
    if (error instanceof ConflitoUnicoError) {
      const concorrente = await buscarLeadPorTelefone(deps, telefoneNormalizado);

      if (concorrente !== null) {
        logger.info('Lead criado concorrentemente, reaproveitando.', {
          telefone: telefoneNormalizado,
        });

        return concorrente;
      }
    }

    throw new PersistenciaError(
      `Falha ao criar lead para o telefone ${telefoneNormalizado}.`,
      TABELA_LEADS,
      { cause: error },
    );
  }
}

/**
 * Fonte de verdade do botão "assumir conversa" do dashboard. Um lead que ainda
 * não existe nunca está sob controle manual.
 */
export async function estaSobControleManual(
  deps: PersistenciaDependencies,
  telefone: string,
): Promise<boolean> {
  const lead = await buscarLeadPorTelefone(deps, telefone);

  return lead?.controle_manual === true;
}

export async function definirControleManual(
  deps: PersistenciaDependencies,
  telefone: string,
  ativo: boolean,
): Promise<Lead> {
  const lead = await resolverLead(deps, telefone);

  try {
    await deps.cliente.atualizarPorId(TABELA_LEADS, lead.id, { controle_manual: ativo });
  } catch (error) {
    throw new PersistenciaError(
      `Falha ao definir controle_manual=${ativo} para o lead ${lead.id}.`,
      TABELA_LEADS,
      { cause: error },
    );
  }

  return { ...lead, controle_manual: ativo };
}
