export interface MensagemContexto {
  role: 'lead' | 'klaus' | 'system';
  conteudo: string;
}

export interface AbordagemSugerida {
  texto: string;
  /** Confiança do ranking de objeções (Componente 4), entre 0 e 1. */
  confianca: number;
}

export interface EntradaGeracaoResposta {
  mensagem: string;
  /** Prompt de sistema montado pelo context builder. */
  sistema: string;
  historico: MensagemContexto[];
  abordagem?: AbordagemSugerida;
}

export type OrigemResposta = 'abordagem' | 'gpt';

export interface SaidaGeracaoResposta {
  resposta: string;
  origem: OrigemResposta;
  confianca: number;
  timestamp: Date;
}

export interface ClienteIAResposta {
  gerarResposta(entrada: EntradaGeracaoResposta): Promise<string>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface GeracaoRespostaDependencies {
  clienteIA: ClienteIAResposta;
  logger?: Logger;
  agora?: () => Date;
}
