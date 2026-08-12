import type { MensagemHistorico } from './historico.js';

export const MAX_FRASES_RESUMO = 6;
export const MIN_CARACTERES_FRASE = 8;

/** Palavras curtas demais para carregar sinal em português. */
const TAMANHO_MINIMO_TERMO = 4;

interface FraseCandidata {
  ordem: number;
  role: string;
  texto: string;
}

export function normalizarTermo(termo: string): string {
  return termo
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function extrairTermos(texto: string): string[] {
  return texto
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizarTermo)
    .filter((termo) => termo.length >= TAMANHO_MINIMO_TERMO);
}

export function dividirEmFrases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+/u)
    .map((frase) => frase.trim())
    .filter((frase) => frase.length >= MIN_CARACTERES_FRASE);
}

function candidatas(mensagens: MensagemHistorico[]): FraseCandidata[] {
  const lista: FraseCandidata[] = [];

  for (const mensagem of mensagens) {
    const frases = dividirEmFrases(mensagem.conteudo);
    const conteudo = mensagem.conteudo.trim();

    // Mensagem de WhatsApp costuma vir sem pontuação: usa a mensagem inteira.
    const textos = frases.length > 0 ? frases : conteudo.length > 0 ? [conteudo] : [];

    for (const texto of textos) {
      lista.push({ ordem: lista.length, role: mensagem.role, texto });
    }
  }

  return lista;
}

/**
 * Resumo extractivo e determinístico das mensagens que saíram da janela.
 *
 * Escolhe frases existentes em vez de reescrever. A decisão é deliberada:
 * um resumo reescrito por LLM num contexto de vendas pode transformar
 * "vou verificar o prazo" em "o prazo é de 5 dias" — vira promessa falsa,
 * além de custar uma chamada extra por turno.
 */
export function resumirMensagens(
  mensagens: MensagemHistorico[],
  maxFrases: number = MAX_FRASES_RESUMO,
): string {
  const frases = candidatas(mensagens);

  if (frases.length === 0) {
    return '';
  }

  if (frases.length <= maxFrases) {
    return renderizar(frases);
  }

  // Frequência por frase (document frequency), não frequência total: termo que
  // aparece em quase toda frase é ruído de preenchimento e precisa valer pouco.
  // Pontuar por frequência bruta faria o resumo escolher o texto mais repetitivo
  // em vez do mais informativo.
  const frequenciaPorFrase = new Map<string, number>();

  for (const frase of frases) {
    for (const termo of new Set(extrairTermos(frase.texto))) {
      frequenciaPorFrase.set(termo, (frequenciaPorFrase.get(termo) ?? 0) + 1);
    }
  }

  const total = frases.length;

  const pontuadas = frases.map((frase) => {
    const termos = new Set(extrairTermos(frase.texto));
    let pontos = 0;

    for (const termo of termos) {
      const ocorrencias = frequenciaPorFrase.get(termo) ?? 1;
      pontos += Math.log(total / ocorrencias);
    }

    return { frase, pontos };
  });

  const selecionadas = pontuadas
    // Empate resolvido pela ordem original: o resumo precisa ser determinístico.
    .sort((a, b) => (b.pontos === a.pontos ? a.frase.ordem - b.frase.ordem : b.pontos - a.pontos))
    .slice(0, maxFrases)
    .map((item) => item.frase)
    .sort((a, b) => a.ordem - b.ordem);

  return renderizar(selecionadas);
}

function renderizar(frases: FraseCandidata[]): string {
  return frases.map((frase) => `${frase.role}: ${frase.texto}`).join(' ');
}

/** Corta o texto para caber no limite de tokens, sem partir palavra ao meio. */
export function truncarPorTokens(texto: string, maxTokens: number, caracteresPorToken = 4): string {
  const limite = Math.max(0, maxTokens * caracteresPorToken);

  if (texto.length <= limite) {
    return texto;
  }

  if (limite === 0) {
    return '';
  }

  const cortado = texto.slice(0, limite);
  const ultimoEspaco = cortado.lastIndexOf(' ');

  return (ultimoEspaco > 0 ? cortado.slice(0, ultimoEspaco) : cortado).trimEnd();
}
