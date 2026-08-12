import { describe, expect, it } from 'vitest';

import { WebhookInvalidoError, parsearWebhook } from './parser.js';

function payload(extra: Record<string, unknown> = {}): unknown {
  return {
    data: {
      key: {
        id: 'wamid.ABC',
        remoteJid: '5511999998888@s.whatsapp.net',
        fromMe: false,
      },
      pushName: 'Ana',
      message: { conversation: 'Olá, quero saber mais' },
      ...extra,
    },
  };
}

describe('parsearWebhook', () => {
  it('extrai os campos de uma mensagem de texto', () => {
    const recebida = parsearWebhook(payload(), new Date('2026-08-12T10:00:00.000Z'));

    expect(recebida).toEqual({
      waMessageId: 'wamid.ABC',
      telefone: '5511999998888',
      nome: 'Ana',
      texto: 'Olá, quero saber mais',
      tipo: 'texto',
      recebidaEm: new Date('2026-08-12T10:00:00.000Z'),
    });
  });

  it('lê texto de extendedTextMessage', () => {
    const recebida = parsearWebhook(
      payload({ message: { extendedTextMessage: { text: 'Resposta citada' } } }),
    );

    expect(recebida.texto).toBe('Resposta citada');
    expect(recebida.tipo).toBe('texto');
  });

  it('usa a legenda da imagem como texto', () => {
    const recebida = parsearWebhook(
      payload({ message: { imageMessage: { caption: 'Segue o print' } } }),
    );

    expect(recebida.tipo).toBe('imagem');
    expect(recebida.texto).toBe('Segue o print');
  });

  it('classifica áudio sem texto', () => {
    const recebida = parsearWebhook(payload({ message: { audioMessage: { seconds: 3 } } }));

    expect(recebida.tipo).toBe('audio');
    expect(recebida.texto).toBe('');
  });

  it('ignora mensagem enviada pelo próprio número', () => {
    const proprio = {
      data: {
        key: { id: 'wamid.X', remoteJid: '5511999998888@s.whatsapp.net', fromMe: true },
        message: { conversation: 'oi' },
      },
    };

    expect(() => parsearWebhook(proprio)).toThrow(WebhookInvalidoError);
  });

  it('ignora mensagem de grupo', () => {
    const grupo = {
      data: {
        key: { id: 'wamid.G', remoteJid: '123456-789@g.us', fromMe: false },
        message: { conversation: 'oi' },
      },
    };

    expect(() => parsearWebhook(grupo)).toThrow(/grupo/i);
  });

  it('rejeita payload sem key', () => {
    expect(() => parsearWebhook({ data: {} })).toThrow(WebhookInvalidoError);
  });

  it('rejeita payload que não é objeto', () => {
    expect(() => parsearWebhook('texto solto')).toThrow(WebhookInvalidoError);
  });

  it('rejeita payload sem corpo de mensagem', () => {
    const semMensagem = {
      data: { key: { id: 'wamid.Y', remoteJid: '5511999998888@s.whatsapp.net' } },
    };

    expect(() => parsearWebhook(semMensagem)).toThrow(WebhookInvalidoError);
  });

  it('aceita payload sem envelope data', () => {
    const plano = {
      key: { id: 'wamid.Z', remoteJid: '5511999998888@s.whatsapp.net', fromMe: false },
      message: { conversation: 'direto' },
    };

    expect(parsearWebhook(plano).texto).toBe('direto');
  });

  it('normaliza telefone com formatação no JID', () => {
    const recebida = parsearWebhook(
      payload({ key: { id: 'w', remoteJid: '+55 11 99999-8888@s.whatsapp.net', fromMe: false } }),
    );

    expect(recebida.telefone).toBe('5511999998888');
  });

  it('devolve nome nulo quando não há pushName', () => {
    const recebida = parsearWebhook(payload({ pushName: undefined }));

    expect(recebida.nome).toBeNull();
  });
});
