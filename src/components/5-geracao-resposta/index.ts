export {
  CONFIANCA_MINIMA_ABORDAGEM,
  COMPONENT_NAME,
  ORIGEM_ABORDAGEM,
  ORIGEM_GPT,
  RESPOSTA_MAX_CARACTERES,
  RESPOSTA_MIN_CARACTERES,
} from './constants.js';

export {
  GeracaoRespostaError,
  ValidacaoRespostaError,
  gerarResposta,
  possuiPlaceholder,
  validarEntrada,
  validarResposta,
} from './gerador.js';

export type {
  AbordagemSugerida,
  ClienteIAResposta,
  EntradaGeracaoResposta,
  GeracaoRespostaDependencies,
  MensagemContexto,
  OrigemResposta,
  SaidaGeracaoResposta,
} from './types.js';
