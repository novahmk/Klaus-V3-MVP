import {
  CONFIANCA_MINIMA_ABORDAGEM,
  ORIGEM_ABORDAGEM,
  ORIGEM_GPT,
  PLACEHOLDER_PATTERNS,
  RESPOSTA_MAX_CARACTERES,
  RESPOSTA_MIN_CARACTERES,
} from './constants.js';
import type {
  EntradaGeracaoResposta,
  GeracaoRespostaDependencies,
  SaidaGeracaoResposta,
} from './types.js';

export class ValidacaoRespostaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidacaoRespostaError';
  }
}

export class GeracaoRespostaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GeracaoRespostaError';
  }
}

export function possuiPlaceholder(texto: string): boolean {
  return PLACEHOLDER_PATTERNS.some((padrao) => padrao.test(texto));
}

export function validarEntrada(entrada: EntradaGeracaoResposta): void {
  if (entrada.mensagem.trim().length === 0) {
    throw new ValidacaoRespostaError('Mensagem do lead não pode ser vazia.');
  }

  if (entrada.sistema.trim().length === 0) {
    throw new ValidacaoRespostaError('Prompt de sistema não pode ser vazio.');
  }

  const confianca = entrada.abordagem?.confianca;

  if (confianca !== undefined && (confianca < 0 || confianca > 1)) {
    throw new ValidacaoRespostaError(`Confiança fora do intervalo 0-1: ${confianca}.`);
  }
}

export function validarResposta(resposta: string): string {
  const texto = resposta.trim();

  if (texto.length < RESPOSTA_MIN_CARACTERES) {
    throw new ValidacaoRespostaError('Resposta vazia ou curta demais.');
  }

  if (texto.length > RESPOSTA_MAX_CARACTERES) {
    throw new ValidacaoRespostaError(
      `Resposta excede ${RESPOSTA_MAX_CARACTERES} caracteres (${texto.length}).`,
    );
  }

  if (possuiPlaceholder(texto)) {
    throw new ValidacaoRespostaError('Resposta contém placeholder não preenchido.');
  }

  return texto;
}

/**
 * Decide entre a abordagem pronta e a IA.
 *
 * A regra é a mesma do desenho original: abordagem com confiança >= 0.6 é
 * usada como está; abaixo disso o modelo assume. Isso mantém o custo baixo no
 * caso comum e reserva a chamada de IA para o caso incerto.
 */
export async function gerarResposta(
  deps: GeracaoRespostaDependencies,
  entrada: EntradaGeracaoResposta,
): Promise<SaidaGeracaoResposta> {
  validarEntrada(entrada);

  const agora = (deps.agora ?? (() => new Date()))();
  const abordagem = entrada.abordagem;

  if (abordagem !== undefined && abordagem.confianca >= CONFIANCA_MINIMA_ABORDAGEM) {
    return {
      resposta: validarResposta(abordagem.texto),
      origem: ORIGEM_ABORDAGEM,
      confianca: abordagem.confianca,
      timestamp: agora,
    };
  }

  deps.logger?.debug('Confiança insuficiente na abordagem, acionando IA.', {
    confianca: abordagem?.confianca ?? null,
  });

  let bruta: string;

  try {
    bruta = await deps.clienteIA.gerarResposta(entrada);
  } catch (error) {
    throw new GeracaoRespostaError('Falha ao gerar resposta com a IA.', { cause: error });
  }

  return {
    resposta: validarResposta(bruta),
    origem: ORIGEM_GPT,
    confianca: abordagem?.confianca ?? 0,
    timestamp: agora,
  };
}
