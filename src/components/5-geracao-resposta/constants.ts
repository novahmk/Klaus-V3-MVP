export const COMPONENT_NAME = '5-geracao-resposta';

/**
 * Abaixo desta confiança a abordagem pronta não é usada e a IA assume.
 * Limiar herdado do desenho original do Componente 5.
 */
export const CONFIANCA_MINIMA_ABORDAGEM = 0.6;

export const ORIGEM_ABORDAGEM = 'abordagem';
export const ORIGEM_GPT = 'gpt';

export const RESPOSTA_MIN_CARACTERES = 2;
export const RESPOSTA_MAX_CARACTERES = 1200;

/** Placeholders de template que nunca podem chegar ao lead. */
export const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\{\{[^}]*\}\}/,
  /\[[A-ZÀ-Ú_ ]{3,}\]/,
  /\bXXXX+\b/i,
];
