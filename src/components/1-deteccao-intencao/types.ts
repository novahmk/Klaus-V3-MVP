export enum Intencao {
  QUER_AGENDAR = 'QUER_AGENDAR',
  QUER_MAIS_INFO = 'QUER_MAIS_INFO',
  TEM_OBJECAO = 'TEM_OBJECAO',
  DEMONSTRA_INTERESSE = 'DEMONSTRA_INTERESSE',
  NAO_INTERESSADO = 'NAO_INTERESSADO',
  NAO_RESPONDEU = 'NAO_RESPONDEU',
}

export interface MensagemHistorico {
  role: 'lead' | 'klaus' | 'system';
  conteudo: string;
  timestamp?: Date;
}

export interface ContextoDeteccao {
  leadId?: string;
  clienteId?: string;
  canal?: string;
  etapaFunil?: string;
  metadata?: Record<string, unknown>;
}

export interface EntradaDeteccaoIntencao {
  mensagem: string;
  historico: MensagemHistorico[];
  contexto: ContextoDeteccao;
}

export interface SaidaDeteccaoIntencao {
  intencao: Intencao;
  confianca: number;
  motivo: string;
  timestamp: Date;
  origem: string;
}

export interface RespostaGptIntencao {
  intencao: Intencao;
  confianca: number;
  motivo: string;
}

export interface ResultadoFallback {
  intencao: Intencao;
  confianca: number;
  motivo: string;
}

export interface DetectorIntencaoConfig {
  openaiApiKey: string;
  openaiModel?: string;
  redisUrl?: string;
  cacheTtlSeconds?: number;
  cacheEnabled?: boolean;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface CacheIntencao {
  get(key: string): Promise<SaidaDeteccaoIntencao | null>;
  set(key: string, value: SaidaDeteccaoIntencao, ttlSeconds?: number): Promise<void>;
  disconnect(): Promise<void>;
}

export interface ClienteOpenAI {
  detectarIntencao(
    mensagem: string,
    historico: MensagemHistorico[],
    contexto: ContextoDeteccao,
  ): Promise<RespostaGptIntencao>;
}
