import { listarMensagensDoLead } from '../persistencia/index.js';
import type { MensagemPersistida, PersistenciaDependencies } from '../persistencia/index.js';

export interface MensagemHistorico {
  role: 'lead' | 'klaus' | 'system';
  conteudo: string;
  timestamp: Date;
}

export interface OpcoesHistorico {
  /** Máximo de mensagens retornadas, das mais recentes para trás. */
  limite?: number;
}

export const LIMITE_PADRAO_HISTORICO = 20;

function mapearPapel(mensagem: MensagemPersistida): 'lead' | 'klaus' {
  return mensagem.direcao === 'entrada' ? 'lead' : 'klaus';
}

/**
 * Fonte única de verdade do histórico: a tabela `mensagens`, sempre chaveada
 * por `leads.id`.
 *
 * Nunca aceitar telefone aqui: formatos diferentes do mesmo número gerariam
 * históricos distintos, e um número mal normalizado poderia misturar conversas
 * de leads diferentes.
 */
export async function carregarHistorico(
  deps: PersistenciaDependencies,
  leadId: string,
  opcoes: OpcoesHistorico = {},
): Promise<MensagemHistorico[]> {
  const limite = opcoes.limite ?? LIMITE_PADRAO_HISTORICO;
  const mensagens = await listarMensagensDoLead(deps, leadId);

  return mensagens.slice(-limite).map((mensagem) => ({
    role: mapearPapel(mensagem),
    conteudo: mensagem.conteudo,
    timestamp: new Date(mensagem.criado_em),
  }));
}

/**
 * Número de trocas do lead no histórico. Alimenta a transição
 * Descoberta → Qualificação do playbook.
 */
export function contarMensagensDoLead(historico: MensagemHistorico[]): number {
  return historico.filter((mensagem) => mensagem.role === 'lead').length;
}

/**
 * Tempo desde a última mensagem do lead. "Não respondeu" é estado temporal,
 * não classificação de intenção — por isso é medido aqui e não pelo Componente 1.
 */
export function horasDesdeUltimaMensagemDoLead(
  historico: MensagemHistorico[],
  agora: Date,
): number | null {
  const ultimas = historico.filter((mensagem) => mensagem.role === 'lead');
  const ultima = ultimas[ultimas.length - 1];

  if (ultima === undefined) {
    return null;
  }

  const milissegundos = agora.getTime() - ultima.timestamp.getTime();

  return milissegundos / (1000 * 60 * 60);
}
