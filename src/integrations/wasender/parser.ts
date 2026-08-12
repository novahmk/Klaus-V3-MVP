export class WebhookInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookInvalidoError';
  }
}

export interface MensagemRecebida {
  waMessageId: string;
  telefone: string;
  nome: string | null;
  texto: string;
  tipo: 'texto' | 'audio' | 'imagem' | 'outro';
  recebidaEm: Date;
}

function comoRegistro(valor: unknown): Record<string, unknown> | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return null;
  }

  return valor as Record<string, unknown>;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null;
}

/**
 * Extrai o telefone do JID do WhatsApp ("5511999998888@s.whatsapp.net").
 * Grupos são descartados: o Klaus não conduz conversa em grupo.
 */
function extrairTelefone(remoteJid: string): string {
  if (remoteJid.includes('@g.us')) {
    throw new WebhookInvalidoError('Mensagem de grupo não é processada.');
  }

  const digitos = remoteJid.split('@')[0]?.replace(/\D/g, '') ?? '';

  if (digitos.length === 0) {
    throw new WebhookInvalidoError(`Não foi possível extrair telefone de "${remoteJid}".`);
  }

  return digitos;
}

function classificarTipo(mensagem: Record<string, unknown>): MensagemRecebida['tipo'] {
  if (comoRegistro(mensagem['audioMessage']) !== null) {
    return 'audio';
  }

  if (comoRegistro(mensagem['imageMessage']) !== null) {
    return 'imagem';
  }

  if (
    texto(mensagem['conversation']) !== null ||
    comoRegistro(mensagem['extendedTextMessage']) !== null
  ) {
    return 'texto';
  }

  return 'outro';
}

function extrairTexto(mensagem: Record<string, unknown>): string {
  const conversa = texto(mensagem['conversation']);

  if (conversa !== null) {
    return conversa;
  }

  const estendida = comoRegistro(mensagem['extendedTextMessage']);
  const textoEstendido = estendida === null ? null : texto(estendida['text']);

  if (textoEstendido !== null) {
    return textoEstendido;
  }

  const imagem = comoRegistro(mensagem['imageMessage']);
  const legenda = imagem === null ? null : texto(imagem['caption']);

  return legenda ?? '';
}

/**
 * Converte o payload do WaSender em um tipo do domínio.
 *
 * Rejeita explicitamente o que não deve ser processado (mensagem própria,
 * grupo, payload malformado) em vez de deixar o erro aparecer depois, no meio
 * da persistência.
 */
export function parsearWebhook(payload: unknown, agora: Date = new Date()): MensagemRecebida {
  const raiz = comoRegistro(payload);

  if (raiz === null) {
    throw new WebhookInvalidoError('Payload do webhook não é um objeto.');
  }

  const dados = comoRegistro(raiz['data']) ?? raiz;
  const chave = comoRegistro(dados['key']);

  if (chave === null) {
    throw new WebhookInvalidoError('Payload sem "key".');
  }

  if (chave['fromMe'] === true) {
    throw new WebhookInvalidoError('Mensagem enviada pelo próprio número, ignorada.');
  }

  const waMessageId = texto(chave['id']);

  if (waMessageId === null) {
    throw new WebhookInvalidoError('Payload sem id de mensagem.');
  }

  const remoteJid = texto(chave['remoteJid']);

  if (remoteJid === null) {
    throw new WebhookInvalidoError('Payload sem remoteJid.');
  }

  const mensagem = comoRegistro(dados['message']);

  if (mensagem === null) {
    throw new WebhookInvalidoError('Payload sem corpo de mensagem.');
  }

  return {
    waMessageId,
    telefone: extrairTelefone(remoteJid),
    nome: texto(dados['pushName']),
    texto: extrairTexto(mensagem),
    tipo: classificarTipo(mensagem),
    recebidaEm: agora,
  };
}
