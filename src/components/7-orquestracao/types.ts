import type { Intencao } from '../../components/1-deteccao-intencao/types.js';
import type { AbordagemSugerida, OrigemResposta } from '../5-geracao-resposta/index.js';
import type { Estagio } from '../../dominio/playbook/index.js';
import type { MensagemHistorico } from '../../infra/memoria/index.js';
import type { ConfiguracaoAgente } from '../../infra/memoria/index.js';
import type { RegrasConversa } from '../../infra/persistencia/index.js';

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface EntradaProcessamento {
  telefone: string;
  texto: string;
  nome?: string | null;
  waMessageId?: string;
  /** Score de qualificação calculado fora do loop (Componente 6). */
  score?: number | null;
  abordagem?: AbordagemSugerida;
}

export interface ResultadoProcessamento {
  estagio: Estagio;
  respondeu: boolean;
  motivo: string;
  intencao?: Intencao;
  resposta?: string;
  origemResposta?: OrigemResposta;
}

export interface EntradaDeteccao {
  mensagem: string;
  historico: MensagemHistorico[];
  leadId: string;
}

export interface DetectorIntencao {
  detectar(entrada: EntradaDeteccao): Promise<{ intencao: Intencao; confianca: number }>;
}

export interface EntradaGerador {
  mensagem: string;
  sistema: string;
  historico: MensagemHistorico[];
  abordagem?: AbordagemSugerida;
}

export interface GeradorResposta {
  gerar(entrada: EntradaGerador): Promise<{ resposta: string; origem: OrigemResposta }>;
}

export interface ConfiguracaoCarregada {
  agente: ConfiguracaoAgente;
  regras: RegrasConversa;
}

export interface ProvedorConfiguracao {
  carregar(): Promise<ConfiguracaoCarregada>;
}

export interface OrquestradorConfig {
  limiarHandoff?: number;
  horasParaFollowup?: number;
  orcamentoTokens?: number;
}
