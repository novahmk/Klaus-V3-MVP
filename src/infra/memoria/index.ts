export {
  LIMITE_PADRAO_HISTORICO,
  carregarHistorico,
  contarMensagensDoLead,
  horasDesdeUltimaMensagemDoLead,
} from './historico.js';
export type { MensagemHistorico, OpcoesHistorico } from './historico.js';

export {
  FRACAO_ORCAMENTO_RESUMO,
  ORCAMENTO_PADRAO_TOKENS,
  estimarTokens,
  montarContexto,
  montarPromptSistema,
} from './contexto.js';
export type { ConfiguracaoAgente, Contexto, EntradaContexto } from './contexto.js';

export {
  MAX_FRASES_RESUMO,
  dividirEmFrases,
  resumirMensagens,
  truncarPorTokens,
} from './resumo.js';

export {
  MAX_FATOS_RECUPERADOS,
  SIMILARIDADE_MINIMA,
  TABELA_LEAD_FATOS,
  calcularSimilaridade,
  esquecerLead,
  formatarFatosParaPrompt,
  listarFatosDoLead,
  recuperarFatosRelevantes,
  registrarFato,
} from './fatos.js';
export type { CategoriaFato, LeadFato, NovoFato } from './fatos.js';
