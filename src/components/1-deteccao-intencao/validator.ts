import { createHash } from 'node:crypto';

import {
  CONFIANCA_MAXIMA,
  CONFIANCA_MINIMA,
  INTENCOES_VALIDAS,
} from './constants.js';
import {
  Intencao,
  type ContextoDeteccao,
  type EntradaDeteccaoIntencao,
  type MensagemHistorico,
  type RespostaGptIntencao,
  type SaidaDeteccaoIntencao,
} from './types.js';

export class ValidacaoDeteccaoIntencaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidacaoDeteccaoIntencaoError';
  }
}

function isIntencaoValida(value: unknown): value is Intencao {
  return (
    typeof value === 'string' &&
    INTENCOES_VALIDAS.includes(value as Intencao)
  );
}

function isConfiancaValida(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= CONFIANCA_MINIMA &&
    value <= CONFIANCA_MAXIMA
  );
}

export function validarEntrada(entrada: EntradaDeteccaoIntencao): void {
  if (!entrada || typeof entrada !== 'object') {
    throw new ValidacaoDeteccaoIntencaoError('Entrada inválida: objeto esperado.');
  }

  if (typeof entrada.mensagem !== 'string') {
    throw new ValidacaoDeteccaoIntencaoError(
      'Entrada inválida: mensagem deve ser uma string.',
    );
  }

  if (!Array.isArray(entrada.historico)) {
    throw new ValidacaoDeteccaoIntencaoError(
      'Entrada inválida: historico deve ser um array.',
    );
  }

  for (const [index, item] of entrada.historico.entries()) {
    validarMensagemHistorico(item, index);
  }

  if (!entrada.contexto || typeof entrada.contexto !== 'object') {
    throw new ValidacaoDeteccaoIntencaoError(
      'Entrada inválida: contexto deve ser um objeto.',
    );
  }
}

function validarMensagemHistorico(item: MensagemHistorico, index: number): void {
  if (!item || typeof item !== 'object') {
    throw new ValidacaoDeteccaoIntencaoError(
      `Histórico inválido no índice ${index}: item deve ser um objeto.`,
    );
  }

  if (!['lead', 'klaus', 'system'].includes(item.role)) {
    throw new ValidacaoDeteccaoIntencaoError(
      `Histórico inválido no índice ${index}: role deve ser lead, klaus ou system.`,
    );
  }

  if (typeof item.conteudo !== 'string') {
    throw new ValidacaoDeteccaoIntencaoError(
      `Histórico inválido no índice ${index}: conteudo deve ser uma string.`,
    );
  }

  if (
    item.timestamp !== undefined &&
    !(item.timestamp instanceof Date) &&
    Number.isNaN(Date.parse(String(item.timestamp)))
  ) {
    throw new ValidacaoDeteccaoIntencaoError(
      `Histórico inválido no índice ${index}: timestamp inválido.`,
    );
  }
}

export function validarRespostaGpt(resposta: unknown): RespostaGptIntencao {
  if (!resposta || typeof resposta !== 'object') {
    throw new ValidacaoDeteccaoIntencaoError(
      'Resposta GPT inválida: objeto esperado.',
    );
  }

  const payload = resposta as Record<string, unknown>;

  if (!isIntencaoValida(payload['intencao'])) {
    throw new ValidacaoDeteccaoIntencaoError(
      'Resposta GPT inválida: intencao desconhecida.',
    );
  }

  if (!isConfiancaValida(payload['confianca'])) {
    throw new ValidacaoDeteccaoIntencaoError(
      'Resposta GPT inválida: confianca deve estar entre 0 e 1.',
    );
  }

  if (typeof payload['motivo'] !== 'string' || payload['motivo'].trim().length === 0) {
    throw new ValidacaoDeteccaoIntencaoError(
      'Resposta GPT inválida: motivo deve ser uma string não vazia.',
    );
  }

  return {
    intencao: payload['intencao'],
    confianca: payload['confianca'],
    motivo: payload['motivo'].trim(),
  };
}

export function validarSaida(saida: SaidaDeteccaoIntencao): SaidaDeteccaoIntencao {
  if (!isIntencaoValida(saida.intencao)) {
    throw new ValidacaoDeteccaoIntencaoError('Saída inválida: intencao desconhecida.');
  }

  if (!isConfiancaValida(saida.confianca)) {
    throw new ValidacaoDeteccaoIntencaoError(
      'Saída inválida: confianca deve estar entre 0 e 1.',
    );
  }

  if (typeof saida.motivo !== 'string' || saida.motivo.trim().length === 0) {
    throw new ValidacaoDeteccaoIntencaoError(
      'Saída inválida: motivo deve ser uma string não vazia.',
    );
  }

  if (!(saida.timestamp instanceof Date) || Number.isNaN(saida.timestamp.getTime())) {
    throw new ValidacaoDeteccaoIntencaoError('Saída inválida: timestamp inválido.');
  }

  if (typeof saida.origem !== 'string' || saida.origem.trim().length === 0) {
    throw new ValidacaoDeteccaoIntencaoError(
      'Saída inválida: origem deve ser uma string não vazia.',
    );
  }

  return {
    ...saida,
    motivo: saida.motivo.trim(),
    origem: saida.origem.trim(),
  };
}

export function gerarChaveCache(
  mensagem: string,
  historico: MensagemHistorico[],
  contexto: ContextoDeteccao,
): string {
  const payload = JSON.stringify({
    mensagem: mensagem.trim().toLowerCase(),
    historico: historico.slice(-5).map((item) => ({
      role: item.role,
      conteudo: item.conteudo.trim().toLowerCase(),
    })),
    contexto: {
      leadId: contexto.leadId ?? null,
      clienteId: contexto.clienteId ?? null,
      canal: contexto.canal ?? null,
      etapaFunil: contexto.etapaFunil ?? null,
    },
  });

  return createHash('sha256').update(payload).digest('hex');
}

export function normalizarMensagem(mensagem: string): string {
  return mensagem.trim().toLowerCase();
}

export function mensagemEstaVazia(mensagem: string): boolean {
  return normalizarMensagem(mensagem).length === 0;
}
