import { Intencao } from '../../components/1-deteccao-intencao/types.js';
import { decidirProximoEstagio } from '../../dominio/playbook/index.js';
import type { DecisaoConversa, Estagio } from '../../dominio/playbook/index.js';
import { ehEstagioValido } from '../../dominio/playbook/estagios.js';
import {
  carregarHistorico,
  contarMensagensDoLead,
  horasDesdeUltimaMensagemDoLead,
  montarContexto,
} from '../../infra/memoria/index.js';
import { esquecerLead, recuperarFatosRelevantes } from '../../infra/memoria/fatos.js';
import type { ConfiguracaoAgente } from '../../infra/memoria/index.js';
import { TABELA_LEADS, registrarMensagem } from '../../infra/persistencia/index.js';
import type { Lead, PersistenciaDependencies, RegrasConversa } from '../../infra/persistencia/index.js';
import type {
  DetectorIntencao,
  EntradaProcessamento,
  GeradorResposta,
  Logger,
  OrquestradorConfig,
  ProvedorConfiguracao,
  ResultadoProcessamento,
} from './types.js';

export const HORAS_FOLLOWUP_PADRAO = 24;
export const LIMIAR_HANDOFF_PADRAO = 70;

export class OrquestracaoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OrquestracaoError';
  }
}

export interface OrquestradorDependencies {
  persistencia: PersistenciaDependencies;
  detector: DetectorIntencao;
  gerador: GeradorResposta;
  configuracao: ProvedorConfiguracao;
  enviar: (telefone: string, texto: string) => Promise<void>;
  logger?: Logger;
  agora?: () => Date;
}

function estagioDoLead(lead: Lead & { estagio?: string }): Estagio {
  const bruto = lead.estagio ?? 'abertura';

  return ehEstagioValido(bruto) ? bruto : 'abertura';
}

/**
 * Orquestrador determinístico.
 *
 * É o caminho padrão e permanece como fallback mesmo depois que o orquestrador
 * agêntico existir. A ordem aqui é fixa de propósito: persistir antes de
 * decidir, decidir antes de responder. Assim uma falha na geração de resposta
 * nunca faz a mensagem do lead se perder.
 */
export async function processarMensagem(
  deps: OrquestradorDependencies,
  entrada: EntradaProcessamento,
  config: OrquestradorConfig = {},
): Promise<ResultadoProcessamento> {
  const agora = (deps.agora ?? (() => new Date()))();

  // 1. Persistir primeiro. Idempotente por waMessageId.
  const registro = await registrarMensagem(deps.persistencia, {
    telefone: entrada.telefone,
    direcao: 'entrada',
    conteudo: entrada.texto,
    nome: entrada.nome ?? undefined,
    ...(entrada.waMessageId === undefined ? {} : { waMessageId: entrada.waMessageId }),
  });

  if (registro.duplicada) {
    deps.logger?.info('Webhook reentregue, nada a processar.', {
      waMessageId: entrada.waMessageId ?? null,
    });

    return { estagio: estagioDoLead(registro.lead), respondeu: false, motivo: 'Mensagem duplicada.' };
  }

  const lead = registro.lead;

  // 2. Controle manual é verificado antes de qualquer chamada de IA:
  //    não faz sentido gastar token para depois descobrir que a IA está pausada.
  if (lead.controle_manual) {
    return {
      estagio: estagioDoLead(lead),
      respondeu: false,
      motivo: 'Controle manual ativo: IA pausada.',
    };
  }

  const historico = await carregarHistorico(deps.persistencia, lead.id);
  const { agente, regras } = await deps.configuracao.carregar();

  const deteccao = await deps.detector.detectar({
    mensagem: entrada.texto,
    historico,
    leadId: lead.id,
  });

  const decisao = decidirProximoEstagio({
    estagioAtual: estagioDoLead(lead),
    intencao: deteccao.intencao,
    controleManual: false,
    optOut: (lead as Lead & { opt_out?: boolean }).opt_out === true,
    mensagensDoLead: contarMensagensDoLead(historico),
    score: entrada.score ?? null,
    limiarHandoff: config.limiarHandoff ?? LIMIAR_HANDOFF_PADRAO,
    horasSemResposta: horasDesdeUltimaMensagemDoLead(historico, agora),
    horasParaFollowup: config.horasParaFollowup ?? HORAS_FOLLOWUP_PADRAO,
  });

  await persistirEstagio(deps, lead, decisao);

  // Opt-out apaga a memória de longo prazo, não só suspende o follow-up:
  // fatos extraídos de conversa são dado pessoal.
  if (decisao.acoes.suspenderFollowup) {
    await esquecerLead(deps.persistencia, lead.id);
  }

  if (!decisao.acoes.responder) {
    return {
      estagio: decisao.estagio,
      respondeu: false,
      motivo: decisao.motivo,
      intencao: deteccao.intencao,
    };
  }

  const contexto = montarContexto({
    configuracao: agente,
    regras,
    estagio: decisao.estagio,
    historico,
    fatos: await recuperarFatosRelevantes(deps.persistencia, lead.id, entrada.texto),
    ...(config.orcamentoTokens === undefined ? {} : { orcamentoTokens: config.orcamentoTokens }),
  });

  const resposta = await deps.gerador.gerar({
    mensagem: entrada.texto,
    sistema: contexto.sistema,
    historico: contexto.historico,
    ...(entrada.abordagem === undefined ? {} : { abordagem: entrada.abordagem }),
  });

  await deps.enviar(lead.telefone, resposta.resposta);

  await registrarMensagem(deps.persistencia, {
    telefone: lead.telefone,
    direcao: 'saida',
    conteudo: resposta.resposta,
  });

  return {
    estagio: decisao.estagio,
    respondeu: true,
    motivo: decisao.motivo,
    intencao: deteccao.intencao,
    resposta: resposta.resposta,
    origemResposta: resposta.origem,
  };
}

async function persistirEstagio(
  deps: OrquestradorDependencies,
  lead: Lead,
  decisao: DecisaoConversa,
): Promise<void> {
  const atual = estagioDoLead(lead);
  const mudou = decisao.estagio !== atual;
  const precisaMarcarOptOut = decisao.acoes.suspenderFollowup;

  if (!mudou && !precisaMarcarOptOut) {
    return;
  }

  try {
    await deps.persistencia.cliente.atualizarPorId(TABELA_LEADS, lead.id, {
      estagio: decisao.estagio,
      ...(precisaMarcarOptOut ? { opt_out: true } : {}),
    });
  } catch (error) {
    throw new OrquestracaoError(`Falha ao atualizar estágio do lead ${lead.id}.`, {
      cause: error,
    });
  }
}

export function ehIntencaoDeEncerramento(intencao: Intencao): boolean {
  return intencao === Intencao.NAO_INTERESSADO;
}
