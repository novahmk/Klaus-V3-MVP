export { Intencao } from './types.js';
export type {
  CacheIntencao,
  ClienteOpenAI,
  ContextoDeteccao,
  DetectorIntencaoConfig,
  EntradaDeteccaoIntencao,
  Logger,
  MensagemHistorico,
  RespostaGptIntencao,
  ResultadoFallback,
  SaidaDeteccaoIntencao,
} from './types.js';

export {
  COMPONENT_NAME,
  DEFAULT_CACHE_TTL_SECONDS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_REDIS_URL,
  DESCRICAO_INTENCOES,
  INTENCOES_VALIDAS,
  ORIGEM_CACHE,
  ORIGEM_FALLBACK,
  ORIGEM_GPT,
} from './constants.js';

export { JSON_RESPONSE_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';

export {
  ValidacaoDeteccaoIntencaoError,
  gerarChaveCache,
  mensagemEstaVazia,
  normalizarMensagem,
  validarEntrada,
  validarRespostaGpt,
  validarSaida,
} from './validator.js';

export { detectarIntencaoPorPalavrasChave } from './fallback.js';

export {
  CacheIntencaoMemoria,
  CacheIntencaoRedis,
  criarCacheIntencao,
} from './cache.js';

export {
  ClienteOpenAIIntencao,
  DetectorIntencao,
  DetectorIntencaoError,
  criarDetectorIntencao,
} from './detector.js';
