import { Intencao } from './types.js';

export const COMPONENT_NAME = '1-deteccao-intencao';

export const ORIGEM_GPT = 'gpt';
export const ORIGEM_CACHE = 'cache';
export const ORIGEM_FALLBACK = 'fallback';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_CACHE_TTL_SECONDS = 3600;
export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export const CONFIANCA_MINIMA = 0;
export const CONFIANCA_MAXIMA = 1;

export const CACHE_KEY_PREFIX = 'klaus:intencao:';

export const INTENCOES_VALIDAS: readonly Intencao[] = [
  Intencao.QUER_AGENDAR,
  Intencao.QUER_MAIS_INFO,
  Intencao.TEM_OBJECAO,
  Intencao.DEMONSTRA_INTERESSE,
  Intencao.NAO_INTERESSADO,
  Intencao.NAO_RESPONDEU,
] as const;

export const DESCRICAO_INTENCOES: Record<Intencao, string> = {
  [Intencao.QUER_AGENDAR]:
    'Lead deseja marcar reunião, demo, call ou visita comercial.',
  [Intencao.QUER_MAIS_INFO]:
    'Lead pede detalhes, preço, funcionalidades ou esclarecimentos.',
  [Intencao.TEM_OBJECAO]:
    'Lead expressa dúvida, resistência, comparação ou barreira à compra.',
  [Intencao.DEMONSTRA_INTERESSE]:
    'Lead mostra interesse positivo sem pedir ação específica ainda.',
  [Intencao.NAO_INTERESSADO]:
    'Lead recusa, pede para parar ou indica falta de fit.',
  [Intencao.NAO_RESPONDEU]:
    'Mensagem vazia, irrelevante, off-topic ou impossível classificar.',
};
