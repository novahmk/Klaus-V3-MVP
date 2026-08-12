import type { Intencao } from '../1-deteccao-intencao/types.js';

export interface Mensagem {
  role: 'lead' | 'klaus' | 'system';
  conteudo: string;
  timestamp?: Date;
}

export interface GeradorPerguntasInput {
  tema: string;
  historico: Mensagem[];
  intencao: Intencao;
  clienteId: string;
  baseConhecimento: unknown;
  perguntasJaFeitas: string[];
}

export interface GeradorPerguntasOutput {
  pergunta: string;
  contextoEsperado: string;
  camada: 1 | 2 | 3;
  timestamp: Date;
  origem: 'gpt' | 'template';
}

export interface RespostaGptPergunta {
  pergunta: string;
  contextoEsperado: string;
}

export type CamadaPergunta = 1 | 2 | 3;

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface CachePerguntas {
  get(key: string): Promise<GeradorPerguntasOutput | null>;
  set(key: string, value: GeradorPerguntasOutput, ttlSeconds?: number): Promise<void>;
  disconnect(): Promise<void>;
}

export interface ClienteOpenAIPerguntas {
  gerarPergunta(
    input: GeradorPerguntasInput,
    camada: CamadaPergunta,
  ): Promise<RespostaGptPergunta>;
}

export interface GeradorPerguntasConfig {
  openaiApiKey: string;
  openaiModel?: string;
  redisUrl?: string;
  cacheTtlSeconds?: number;
  cacheEnabled?: boolean;
}

export interface GeradorPerguntasDependencies {
  logger?: Logger;
  cache?: CachePerguntas;
  openaiClient?: ClienteOpenAIPerguntas;
}
