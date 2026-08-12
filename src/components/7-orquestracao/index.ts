export {
  HORAS_FOLLOWUP_PADRAO,
  LIMIAR_HANDOFF_PADRAO,
  OrquestracaoError,
  ehIntencaoDeEncerramento,
  processarMensagem,
} from './orquestrador.js';
export type { OrquestradorDependencies } from './orquestrador.js';

export type {
  ConfiguracaoCarregada,
  DetectorIntencao,
  EntradaDeteccao,
  EntradaGerador,
  EntradaProcessamento,
  GeradorResposta,
  OrquestradorConfig,
  ProvedorConfiguracao,
  ResultadoProcessamento,
} from './types.js';
