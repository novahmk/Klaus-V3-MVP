export class ValidacaoPersistenciaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidacaoPersistenciaError';
  }
}

/**
 * Violação de índice único. É esperada e tratável: dois webhooks simultâneos do
 * mesmo telefone, ou reentrega da mesma mensagem do WhatsApp.
 */
export class ConflitoUnicoError extends Error {
  readonly tabela: string;

  constructor(tabela: string, restricao: string, options?: { cause?: unknown }) {
    super(`Conflito de unicidade em ${tabela} (${restricao}).`, options);
    this.name = 'ConflitoUnicoError';
    this.tabela = tabela;
  }
}

/**
 * Erros de persistência são sempre propagados com a causa original. O
 * comportamento antigo — engolir a falha em try/catch — escondia inserts que
 * nunca aconteciam.
 */
export class PersistenciaError extends Error {
  readonly tabela: string;

  constructor(message: string, tabela: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PersistenciaError';
    this.tabela = tabela;
  }
}
