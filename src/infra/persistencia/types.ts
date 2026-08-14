export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export type ValorFiltro = string | number | boolean;

export interface Ordenacao {
  coluna: string;
  ascendente: boolean;
}

export interface OpcoesConsulta {
  ordenacao?: Ordenacao;
  /** Sem limite explícito, uma tabela que cresce vira consulta ilimitada. */
  limite?: number;
  deslocamento?: number;
}

/**
 * Porta de acesso ao banco. Mantida estreita de propósito: o componente não
 * depende do SDK do Supabase, o que permite testar o comportamento real de
 * resolução de lead e persistência sem rede.
 */
export interface ClienteSupabase {
  selecionarUm<T>(tabela: string, filtros: Record<string, ValorFiltro>): Promise<T | null>;
  selecionarTodos<T>(
    tabela: string,
    filtros: Record<string, ValorFiltro>,
    opcoes?: OpcoesConsulta,
  ): Promise<T[]>;
  contar(tabela: string, filtros: Record<string, ValorFiltro>): Promise<number>;
  inserirUm<T>(tabela: string, valores: Record<string, unknown>): Promise<T>;
  atualizarPorId(tabela: string, id: string, valores: Record<string, unknown>): Promise<void>;
  /** Exclui linhas que casam com os filtros e devolve quantas foram removidas. */
  excluir(tabela: string, filtros: Record<string, ValorFiltro>): Promise<number>;
}

export interface Lead {
  id: string;
  telefone: string;
  nome: string | null;
  controle_manual: boolean;
  ultima_mensagem: string | null;
  ultima_interacao: string | null;
  /** Estágio do playbook (ver `dominio/playbook/estagios.ts`). Coluna sempre presente no banco. */
  estagio: string;
}

export type DirecaoMensagem = 'entrada' | 'saida';

export interface MensagemPersistida {
  id: string;
  lead_id: string;
  direcao: DirecaoMensagem;
  conteudo: string;
  wa_message_id: string | null;
  criado_em: string;
}

export interface RegistrarMensagemInput {
  telefone: string;
  direcao: DirecaoMensagem;
  conteudo: string;
  nome?: string;
  /** Id da mensagem no WhatsApp. Garante idempotência na reentrega do webhook. */
  waMessageId?: string;
}

export interface RegistrarMensagemOutput {
  lead: Lead;
  mensagem: MensagemPersistida;
  /** true quando a mensagem já existia e nada novo foi gravado. */
  duplicada: boolean;
}

/**
 * Schema real verificado no banco: singleton, horários como TIME.
 */
export interface FollowupConfig {
  max_followups: number;
  intervalo_dias: number;
  parar_aos_fins_de_semana: boolean;
  horario_inicio: string;
  horario_fim: string;
}

export interface FollowupModelo {
  ordem: number;
  titulo: string;
  mensagem: string;
  ativo: boolean;
}

/**
 * Singleton que o dashboard já edita. Substitui a tabela `cfg_regras_conversa`,
 * que nunca existiu no banco.
 */
export interface RegrasConversa {
  nao_prometer: string[];
  sempre_confirmar: string[];
  escalar_humano_quando: string[];
}

export interface PersistenciaDependencies {
  cliente: ClienteSupabase;
  logger?: Logger;
  agora?: () => Date;
}
