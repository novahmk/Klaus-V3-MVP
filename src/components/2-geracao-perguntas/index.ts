export type {
  CachePerguntas,
  CamadaPergunta,
  ClienteOpenAIPerguntas,
  GeradorPerguntasConfig,
  GeradorPerguntasDependencies,
  GeradorPerguntasInput,
  GeradorPerguntasOutput,
  Logger,
  Mensagem,
  RespostaGptPergunta,
} from './types.js';

export {
  COMPONENT_NAME,
  DEFAULT_CACHE_TTL_SECONDS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_REDIS_URL,
  DESCRICAO_CAMADAS,
  INDICADORES_PERGUNTA_ABERTA,
  ORIGEM_CACHE,
  ORIGEM_GPT,
  ORIGEM_TEMPLATE,
  PERGUNTA_MAX_CARACTERES,
  PERGUNTA_MIN_CARACTERES,
  SIMILARIDADE_MAXIMA,
  TEMPLATES_FALLBACK,
} from './constants.js';

export { JSON_RESPONSE_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';

export {
  ValidacaoGeradorPerguntasError,
  calcularSimilaridadeJaccard,
  determinarCamada,
  ehPerguntaAberta,
  gerarChaveCache,
  interpolarTemplate,
  normalizarTexto,
  possuiPlaceholder,
  validarEntrada,
  validarPergunta,
  validarRespostaGpt,
  validarSaida,
  validarTamanhoPergunta,
} from './validators.js';

export {
  CachePerguntasMemoria,
  CachePerguntasRedis,
  criarCachePerguntas,
} from './cache.js';

export { gerarPerguntaPorTemplate } from './templates.js';

export {
  ClienteOpenAIPerguntasImpl,
  GeradorPerguntas,
  GeradorPerguntasError,
  criarGeradorPerguntas,
} from './generator.js';
