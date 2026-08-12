import type { CamadaPergunta } from './types.js';

export const COMPONENT_NAME = '2-geracao-perguntas';

export const ORIGEM_GPT = 'gpt';
export const ORIGEM_TEMPLATE = 'template';
export const ORIGEM_CACHE = 'cache';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_CACHE_TTL_SECONDS = 3600;
export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export const CACHE_KEY_PREFIX = 'klaus:pergunta:';

export const PERGUNTA_MIN_CARACTERES = 20;
export const PERGUNTA_MAX_CARACTERES = 150;
export const SIMILARIDADE_MAXIMA = 0.7;

export const DESCRICAO_CAMADAS: Record<CamadaPergunta, string> = {
  1: 'Necessidade — descobrir dor, objetivo e contexto do lead.',
  2: 'Objeção — explorar barreiras, dúvidas e resistências.',
  3: 'Confirmação — validar prontidão e próximo passo com clareza.',
};

export const TEMPLATES_FALLBACK: Record<CamadaPergunta, readonly string[]> = {
  1: [
    'Qual é o principal objetivo que você busca alcançar ao explorar {tema} no seu contexto atual?',
    'Como {tema} impacta hoje os resultados ou a rotina do seu time?',
    'O que te motivou a considerar {tema} como uma prioridade neste momento?',
  ],
  2: [
    'O que mais pesa na sua decisão ou gera dúvida quando você pensa em avançar com {tema}?',
    'Qual aspecto de {tema} ainda não ficou claro o suficiente para você se sentir seguro?',
    'Como você avalia os riscos ou limitações de implementar {tema} na sua operação?',
  ],
  3: [
    'Como você imagina que uma conversa com nosso especialista poderia destravar seu próximo passo?',
    'Qual seria o resultado ideal para você após avançarmos juntos com {tema}?',
    'O que precisaria acontecer para você se sentir confiante em dar o próximo passo com {tema}?',
  ],
};

export const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\{[^}]+\}/,
  /\{\{[^}]+\}\}/,
  /\[[^\]]+\]/,
  /<[^>]+>/,
  /_{2,}/,
  /\bXXX\b/,
  /\bTBD\b/i,
  /\bnome do lead\b/i,
  /\bseu nome\b/i,
];

export const PERGUNTA_FECHADA_PATTERNS: readonly RegExp[] = [
  /^(você|voce|vc)\s+(tem|gostaria|pode|consegue|quer|prefere)\b/i,
  /^(posso|podemos)\s+(te|lhe)\s+(ajudar|mostrar|enviar|marcar)\b/i,
  /^é\s+(interessante|possível|possivel)\s+para\s+(você|voce)\b/i,
  /\b(sim ou não|sim\/não|sim ou nao)\b/i,
  /^(certo|ok|beleza)\?\s*$/i,
];

export const INDICADORES_PERGUNTA_ABERTA: readonly RegExp[] = [
  /\bcomo\b/i,
  /\bo que\b/i,
  /\bqual\b/i,
  /\bquais\b/i,
  /\bpor que\b/i,
  /\bpor quê\b/i,
  /\bde que forma\b/i,
  /\bcont(e|a)\b/i,
  /\bdescr(eve|iba)\b/i,
  /\bexplique\b/i,
  /\bquanto\b/i,
  /\bonde\b/i,
  /\bquando\b/i,
];
