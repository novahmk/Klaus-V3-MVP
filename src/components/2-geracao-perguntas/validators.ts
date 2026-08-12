import { createHash } from 'node:crypto';

import {
  INDICADORES_PERGUNTA_ABERTA,
  PERGUNTA_FECHADA_PATTERNS,
  PERGUNTA_MAX_CARACTERES,
  PERGUNTA_MIN_CARACTERES,
  PLACEHOLDER_PATTERNS,
  SIMILARIDADE_MAXIMA,
} from './constants.js';
import type {
  CamadaPergunta,
  GeradorPerguntasInput,
  GeradorPerguntasOutput,
  RespostaGptPergunta,
} from './types.js';

export class ValidacaoGeradorPerguntasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidacaoGeradorPerguntasError';
  }
}

export function determinarCamada(numeroPerguntasFeitas: number): CamadaPergunta {
  if (numeroPerguntasFeitas === 0) {
    return 1;
  }

  if (numeroPerguntasFeitas === 1) {
    return 2;
  }

  return 3;
}

export function normalizarTexto(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function tokenizar(texto: string): Set<string> {
  const tokens = normalizarTexto(texto)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);

  return new Set(tokens);
}

export function calcularSimilaridadeJaccard(a: string, b: string): number {
  const tokensA = tokenizar(a);
  const tokensB = tokenizar(b);

  if (tokensA.size === 0 && tokensB.size === 0) {
    return 1;
  }

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersecao = 0;

  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersecao += 1;
    }
  }

  const uniao = new Set([...tokensA, ...tokensB]).size;
  return intersecao / uniao;
}

export function possuiPlaceholder(pergunta: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(pergunta));
}

export function ehPerguntaAberta(pergunta: string): boolean {
  const normalizada = normalizarTexto(pergunta);

  if (PERGUNTA_FECHADA_PATTERNS.some((pattern) => pattern.test(normalizada))) {
    return false;
  }

  return INDICADORES_PERGUNTA_ABERTA.some((pattern) => pattern.test(normalizada));
}

export function terminaComInterrogacao(pergunta: string): boolean {
  return pergunta.trim().endsWith('?');
}

export function validarTamanhoPergunta(pergunta: string): void {
  const tamanho = pergunta.trim().length;

  if (tamanho < PERGUNTA_MIN_CARACTERES || tamanho > PERGUNTA_MAX_CARACTERES) {
    throw new ValidacaoGeradorPerguntasError(
      `Pergunta deve ter entre ${PERGUNTA_MIN_CARACTERES} e ${PERGUNTA_MAX_CARACTERES} caracteres.`,
    );
  }
}

export function validarRepeticao(
  pergunta: string,
  perguntasJaFeitas: readonly string[],
): void {
  const normalizada = normalizarTexto(pergunta);

  for (const anterior of perguntasJaFeitas) {
    if (normalizarTexto(anterior) === normalizada) {
      throw new ValidacaoGeradorPerguntasError('Pergunta repetida detectada.');
    }

    const similaridade = calcularSimilaridadeJaccard(pergunta, anterior);

    if (similaridade > SIMILARIDADE_MAXIMA) {
      throw new ValidacaoGeradorPerguntasError(
        `Pergunta muito similar a uma anterior (${Math.round(similaridade * 100)}%).`,
      );
    }
  }
}

export function validarPergunta(
  pergunta: string,
  perguntasJaFeitas: readonly string[] = [],
): void {
  validarTamanhoPergunta(pergunta);

  if (!terminaComInterrogacao(pergunta)) {
    throw new ValidacaoGeradorPerguntasError('Pergunta deve terminar com "?".');
  }

  if (possuiPlaceholder(pergunta)) {
    throw new ValidacaoGeradorPerguntasError('Pergunta contém placeholder não permitido.');
  }

  if (!ehPerguntaAberta(pergunta)) {
    throw new ValidacaoGeradorPerguntasError('Pergunta deve ser aberta.');
  }

  validarRepeticao(pergunta, perguntasJaFeitas);
}

export function validarEntrada(input: GeradorPerguntasInput): void {
  if (!input || typeof input !== 'object') {
    throw new ValidacaoGeradorPerguntasError('Entrada inválida: objeto esperado.');
  }

  if (typeof input.tema !== 'string' || input.tema.trim().length === 0) {
    throw new ValidacaoGeradorPerguntasError('Entrada inválida: tema é obrigatório.');
  }

  if (!Array.isArray(input.historico)) {
    throw new ValidacaoGeradorPerguntasError('Entrada inválida: historico deve ser um array.');
  }

  if (typeof input.clienteId !== 'string' || input.clienteId.trim().length === 0) {
    throw new ValidacaoGeradorPerguntasError('Entrada inválida: clienteId é obrigatório.');
  }

  if (!Array.isArray(input.perguntasJaFeitas)) {
    throw new ValidacaoGeradorPerguntasError(
      'Entrada inválida: perguntasJaFeitas deve ser um array.',
    );
  }

  for (const [index, pergunta] of input.perguntasJaFeitas.entries()) {
    if (typeof pergunta !== 'string') {
      throw new ValidacaoGeradorPerguntasError(
        `Entrada inválida: perguntasJaFeitas[${index}] deve ser string.`,
      );
    }
  }
}

export function validarRespostaGpt(resposta: unknown): RespostaGptPergunta {
  if (!resposta || typeof resposta !== 'object') {
    throw new ValidacaoGeradorPerguntasError('Resposta GPT inválida: objeto esperado.');
  }

  const payload = resposta as Record<string, unknown>;

  if (typeof payload['pergunta'] !== 'string') {
    throw new ValidacaoGeradorPerguntasError('Resposta GPT inválida: pergunta ausente.');
  }

  if (
    typeof payload['contextoEsperado'] !== 'string' ||
    payload['contextoEsperado'].trim().length === 0
  ) {
    throw new ValidacaoGeradorPerguntasError(
      'Resposta GPT inválida: contextoEsperado ausente.',
    );
  }

  return {
    pergunta: payload['pergunta'].trim(),
    contextoEsperado: payload['contextoEsperado'].trim(),
  };
}

export function validarSaida(
  saida: GeradorPerguntasOutput,
  perguntasJaFeitas: readonly string[] = [],
): GeradorPerguntasOutput {
  if (saida.camada !== 1 && saida.camada !== 2 && saida.camada !== 3) {
    throw new ValidacaoGeradorPerguntasError('Saída inválida: camada deve ser 1, 2 ou 3.');
  }

  if (saida.origem !== 'gpt' && saida.origem !== 'template') {
    throw new ValidacaoGeradorPerguntasError('Saída inválida: origem deve ser gpt ou template.');
  }

  validarPergunta(saida.pergunta, perguntasJaFeitas);

  if (typeof saida.contextoEsperado !== 'string' || saida.contextoEsperado.trim().length === 0) {
    throw new ValidacaoGeradorPerguntasError('Saída inválida: contextoEsperado é obrigatório.');
  }

  if (!(saida.timestamp instanceof Date) || Number.isNaN(saida.timestamp.getTime())) {
    throw new ValidacaoGeradorPerguntasError('Saída inválida: timestamp inválido.');
  }

  return {
    ...saida,
    pergunta: saida.pergunta.trim(),
    contextoEsperado: saida.contextoEsperado.trim(),
  };
}

export function gerarChaveCache(
  input: GeradorPerguntasInput,
  camada: CamadaPergunta,
): string {
  const payload = JSON.stringify({
    tema: normalizarTexto(input.tema),
    camada,
    intencao: input.intencao,
    clienteId: input.clienteId,
    perguntasJaFeitas: input.perguntasJaFeitas.map(normalizarTexto),
    historico: input.historico.slice(-5).map((item) => ({
      role: item.role,
      conteudo: normalizarTexto(item.conteudo),
    })),
  });

  return createHash('sha256').update(payload).digest('hex');
}

export function interpolarTemplate(template: string, tema: string): string {
  return template.replace(/\{tema\}/g, tema.trim());
}
