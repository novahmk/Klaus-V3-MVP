import type { RegrasConversa } from '../persistencia/index.js';
import type { LeadFato } from './fatos.js';
import { formatarFatosParaPrompt } from './fatos.js';
import type { MensagemHistorico } from './historico.js';
import { resumirMensagens, truncarPorTokens } from './resumo.js';

/** Estimativa conservadora: ~4 caracteres por token em português. */
const CARACTERES_POR_TOKEN = 4;

export const ORCAMENTO_PADRAO_TOKENS = 2000;

/** Fatia do orçamento reservada ao resumo quando há mensagens fora da janela. */
export const FRACAO_ORCAMENTO_RESUMO = 0.15;

export interface ConfiguracaoAgente {
  persona: string;
  objetivo: string;
  tomDeVoz?: string;
  contexto?: string;
}

export interface EntradaContexto {
  configuracao: ConfiguracaoAgente;
  regras: RegrasConversa;
  estagio: string;
  historico: MensagemHistorico[];
  /** Fatos duráveis do lead, já filtrados por relevância. */
  fatos?: LeadFato[];
  orcamentoTokens?: number;
}

export interface Contexto {
  sistema: string;
  historico: MensagemHistorico[];
  /** Resumo das mensagens que não couberam na janela. Vazio se coube tudo. */
  resumo: string;
  tokensEstimados: number;
  mensagensDescartadas: number;
}

export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / CARACTERES_POR_TOKEN);
}

function formatarRegras(regras: RegrasConversa): string {
  const blocos: string[] = [];

  if (regras.nao_prometer.length > 0) {
    blocos.push(`Nunca prometa: ${regras.nao_prometer.join('; ')}.`);
  }

  if (regras.sempre_confirmar.length > 0) {
    blocos.push(`Sempre confirme antes de avançar: ${regras.sempre_confirmar.join('; ')}.`);
  }

  if (regras.escalar_humano_quando.length > 0) {
    blocos.push(`Escale para um humano quando: ${regras.escalar_humano_quando.join('; ')}.`);
  }

  return blocos.join('\n');
}

export function montarPromptSistema(entrada: EntradaContexto): string {
  return montarSistemaCom(entrada, '');
}

function montarSistemaCom(entrada: EntradaContexto, resumo: string): string {
  const { configuracao, regras, estagio } = entrada;
  const partes = [
    `Persona: ${configuracao.persona}`,
    `Objetivo: ${configuracao.objetivo}`,
  ];

  if (configuracao.tomDeVoz !== undefined && configuracao.tomDeVoz.trim().length > 0) {
    partes.push(`Tom de voz: ${configuracao.tomDeVoz}`);
  }

  if (configuracao.contexto !== undefined && configuracao.contexto.trim().length > 0) {
    partes.push(`Contexto do negócio: ${configuracao.contexto}`);
  }

  partes.push(`Estágio atual da conversa: ${estagio}`);

  const textoRegras = formatarRegras(regras);

  if (textoRegras.length > 0) {
    partes.push(`Regras obrigatórias:\n${textoRegras}`);
  }

  // Fatos do lead também ficam fora do fluxo truncado: são exatamente o que
  // o modelo precisa lembrar quando a conversa fica longa.
  const textoFatos = formatarFatosParaPrompt(entrada.fatos ?? []);

  if (textoFatos.length > 0) {
    partes.push(`Fatos conhecidos deste lead:\n${textoFatos}`);
  }

  // O resumo entra no prompt de sistema de propósito: assim ele nunca é
  // truncado junto com o histórico que ele próprio representa.
  if (resumo.length > 0) {
    partes.push(`Resumo da conversa até aqui:\n${resumo}`);
  }

  return partes.join('\n\n');
}

function selecionarRecentes(
  historico: MensagemHistorico[],
  tokensDisponiveis: number,
): { selecionadas: MensagemHistorico[]; tokens: number } {
  const selecionadas: MensagemHistorico[] = [];
  let tokens = 0;

  for (let indice = historico.length - 1; indice >= 0; indice -= 1) {
    const mensagem = historico[indice];

    if (mensagem === undefined) {
      continue;
    }

    const custo = estimarTokens(mensagem.conteudo);

    if (tokens + custo > tokensDisponiveis) {
      break;
    }

    tokens += custo;
    selecionadas.unshift(mensagem);
  }

  return { selecionadas, tokens };
}

/**
 * Monta o contexto enviado ao modelo.
 *
 * O truncamento é por orçamento de tokens, não por número fixo de mensagens:
 * o custo real é token, e limitar por quantidade deixa o gasto imprevisível.
 * As mensagens mais recentes são preservadas; as antigas viram resumo em vez
 * de desaparecerem sem registro.
 */
export function montarContexto(entrada: EntradaContexto): Contexto {
  const orcamento = entrada.orcamentoTokens ?? ORCAMENTO_PADRAO_TOKENS;
  const sistemaBase = montarSistemaCom(entrada, '');
  const tokensSistemaBase = estimarTokens(sistemaBase);

  // Primeira passada sem reserva: se tudo couber, o resumo é desnecessário e
  // não faz sentido bloquear parte do orçamento à toa.
  const completa = selecionarRecentes(entrada.historico, orcamento - tokensSistemaBase);

  if (completa.selecionadas.length === entrada.historico.length) {
    return {
      sistema: sistemaBase,
      historico: completa.selecionadas,
      resumo: '',
      tokensEstimados: tokensSistemaBase + completa.tokens,
      mensagensDescartadas: 0,
    };
  }

  // Segunda passada: parte do orçamento passa a pertencer ao resumo.
  const orcamentoResumo = Math.floor(orcamento * FRACAO_ORCAMENTO_RESUMO);
  const parcial = selecionarRecentes(
    entrada.historico,
    orcamento - tokensSistemaBase - orcamentoResumo,
  );

  const foraDaJanela = entrada.historico.slice(
    0,
    entrada.historico.length - parcial.selecionadas.length,
  );

  let resumo = truncarPorTokens(
    resumirMensagens(foraDaJanela),
    orcamentoResumo,
    CARACTERES_POR_TOKEN,
  );
  let sistema = montarSistemaCom(entrada, resumo);

  // O bloco do resumo tem rótulo e separadores, que também custam tokens.
  // Reduz até a soma final caber, senão o orçamento seria violado justamente
  // pelo mecanismo criado para respeitá-lo.
  while (resumo.length > 0 && estimarTokens(sistema) + parcial.tokens > orcamento) {
    const tokensAtuais = estimarTokens(resumo);
    const novoLimite = Math.max(0, tokensAtuais - Math.max(1, Math.ceil(tokensAtuais * 0.1)));

    resumo = truncarPorTokens(resumo, novoLimite, CARACTERES_POR_TOKEN);
    sistema = montarSistemaCom(entrada, resumo);
  }

  return {
    sistema,
    historico: parcial.selecionadas,
    resumo,
    tokensEstimados: estimarTokens(sistema) + parcial.tokens,
    mensagensDescartadas: foraDaJanela.length,
  };
}
