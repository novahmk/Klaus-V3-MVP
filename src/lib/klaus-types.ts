/**
 * Tipos que espelham o contrato real da API do backend Klaus (`/api/*`).
 *
 * Separado de `klaus-data.ts` de propósito: aquele arquivo contém os dados
 * mockados usados apenas pela tela de Prospecção (fora de escopo da
 * integração real). Kanban e Configuração usam exclusivamente os tipos daqui.
 */

/** Estágios reais do playbook (ver `dominio/playbook/estagios.ts` no backend). */
export type Estagio =
  "abertura" | "descoberta" | "qualificacao" | "objecao" | "handoff" | "followup" | "encerrado";

export const ESTAGIOS: { valor: Estagio; rotulo: string }[] = [
  { valor: "abertura", rotulo: "Abertura" },
  { valor: "descoberta", rotulo: "Descoberta" },
  { valor: "qualificacao", rotulo: "Qualificação" },
  { valor: "objecao", rotulo: "Objeção" },
  { valor: "handoff", rotulo: "Handoff" },
  { valor: "followup", rotulo: "Follow-up" },
  { valor: "encerrado", rotulo: "Encerrado" },
];

export function rotuloEstagio(estagio: Estagio): string {
  return ESTAGIOS.find((e) => e.valor === estagio)?.rotulo ?? estagio;
}

/** Espelha `Lead` em `src/infra/persistencia/types.ts` do backend. */
export interface LeadReal {
  id: string;
  telefone: string;
  nome: string | null;
  controle_manual: boolean;
  ultima_mensagem: string | null;
  ultima_interacao: string | null;
  estagio: Estagio;
}

/** Espelha `MensagemPersistida` do backend. */
export interface MensagemReal {
  id: string;
  lead_id: string;
  direcao: "entrada" | "saida";
  conteudo: string;
  criado_em: string;
}

/** Espelha `PaginaDeLeads` retornado por `GET /api/leads`. */
export interface PaginaDeLeads {
  leads: LeadReal[];
  total: number;
  pagina: number;
  limite: number;
}

export interface ConsultaLeadsInput {
  estagio?: Estagio;
  pagina?: number;
  limite?: number;
}

/** Espelha o body aceito por `POST /api/leads/{id}/mensagens` (rota ainda não existe no backend). */
export interface EnviarMensagemInput {
  id: string;
  conteudo: string;
}

/** Espelha o objeto `agente` retornado por `buscarConfiguracao` (fonte: Supabase `config_ia`). */
export interface ConfiguracaoAgente {
  persona: string;
  objetivo: string;
  tomDeVoz: string;
  contexto: string;
}

/** Espelha o objeto `regras` de `GET /api/config`. */
export interface RegrasConversaReal {
  nao_prometer: string[];
  sempre_confirmar: string[];
  escalar_humano_quando: string[];
}

export interface ConfiguracaoCarregada {
  agente: ConfiguracaoAgente;
  regras: RegrasConversaReal;
}

/**
 * Espelha o body aceito por `PUT /api/config`.
 *
 * Os campos de `regras` ainda não são aceitos pelo backend hoje — a rota só
 * processa persona/objetivo/tomDeVoz/contexto. Enviá-los é preparação para
 * quando o backend passar a aceitá-los.
 */
export interface AtualizarConfiguracaoInput {
  persona?: string;
  objetivo?: string;
  tomDeVoz?: string;
  contexto?: string;
  nao_prometer?: string[];
  sempre_confirmar?: string[];
  escalar_humano_quando?: string[];
}

/** Contato solto (ainda não é um `Lead`) enviado para disparo manual de prospecção. */
export interface ItemProspeccao {
  nome: string;
  telefone: string;
}

/**
 * Espelha o body aceito por `POST /api/prospeccao/manual-disparos` (rota ainda não
 * existe no backend; contrato referenciado em `.lovable/plan/`). `clienteId` é
 * preenchido no servidor do dashboard, nunca pelo cliente.
 */
export interface IniciarProspeccaoInput {
  clienteId: string;
  origem: "planilha" | "manual";
  mensagem: string;
  itens: ItemProspeccao[];
}
