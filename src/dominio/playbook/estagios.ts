/**
 * Estágios da conversa. `encerrado` é terminal e existe para dar destino ao
 * lead que pediu para parar — o playbook original não tinha saída negativa.
 */
export const ESTAGIOS = [
  'abertura',
  'descoberta',
  'qualificacao',
  'objecao',
  'handoff',
  'followup',
  'encerrado',
] as const;

export type Estagio = (typeof ESTAGIOS)[number];

export const ESTAGIO_INICIAL: Estagio = 'abertura';

export const OBJETIVO_POR_ESTAGIO: Record<Estagio, string> = {
  abertura: 'Confirmar interesse e identificar a intenção inicial.',
  descoberta: 'Entender contexto do lead: cargo, nicho e dor.',
  qualificacao: 'Coletar sinais de orçamento, urgência e autoridade.',
  objecao: 'Responder dúvidas e resistências com a base de conhecimento.',
  handoff: 'Passar o lead para atendimento humano.',
  followup: 'Reengajar lead sem resposta.',
  encerrado: 'Conversa encerrada. Nenhuma ação automática.',
};

export function ehEstagioValido(valor: string): valor is Estagio {
  return (ESTAGIOS as readonly string[]).includes(valor);
}
