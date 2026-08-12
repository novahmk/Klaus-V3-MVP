export type {
  ClienteSupabase,
  DirecaoMensagem,
  FollowupConfig,
  FollowupModelo,
  Lead,
  Logger,
  MensagemPersistida,
  OpcoesConsulta,
  Ordenacao,
  PersistenciaDependencies,
  RegistrarMensagemInput,
  RegistrarMensagemOutput,
  RegrasConversa,
  ValorFiltro,
} from './types.js';

export {
  COMPONENT_NAME,
  DIRECAO_ENTRADA,
  DIRECAO_SAIDA,
  FOLLOWUP_CONFIG_PADRAO,
  REGRAS_CONVERSA_PADRAO,
  TABELA_FOLLOWUP_CONFIG,
  TABELA_FOLLOWUP_MODELOS,
  TABELA_LEADS,
  TABELA_MENSAGENS,
  TABELA_REGRAS_CONVERSA,
} from './constants.js';

export { ConflitoUnicoError, PersistenciaError, ValidacaoPersistenciaError } from './errors.js';

export { ehTelefoneValido, normalizarTelefone } from './telefone.js';

export {
  buscarLeadPorTelefone,
  definirControleManual,
  estaSobControleManual,
  resolverLead,
} from './leads.js';

export {
  LIMITE_MAXIMO_LEADS,
  LIMITE_PADRAO_LEADS,
  buscarLeadPorId,
  definirControleManualPorId,
  listarLeads,
} from './consultas.js';
export type { ConsultaLeads, PaginaDeLeads } from './consultas.js';

export { listarMensagensDoLead, registrarMensagem } from './mensagens.js';

export {
  carregarFollowupConfig,
  carregarModelosAtivos,
  converterHorarioEmMinutos,
  dentroDaJanelaDeEnvio,
  selecionarProximoModelo,
} from './followup.js';

export {
  carregarRegrasConversa,
  deveEscalarParaHumano,
  formatarRegrasParaPrompt,
} from './regras.js';
