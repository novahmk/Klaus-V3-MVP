import { describe, expect, it, vi } from 'vitest';

import { CacheIntencaoMemoria } from './cache.js';
import { DetectorIntencao } from './detector.js';
import { Intencao, type ClienteOpenAI, type Logger, type SaidaDeteccaoIntencao } from './types.js';

const loggerMock: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const config = {
  openaiApiKey: 'test-key',
  cacheEnabled: true,
};

describe('DetectorIntencao', () => {
  it('retorna NAO_RESPONDEU para mensagem vazia sem chamar GPT', async () => {
    const openaiClient: ClienteOpenAI = {
      detectarIntencao: vi.fn(),
    };
    const detector = new DetectorIntencao(config, {
      logger: loggerMock,
      cache: new CacheIntencaoMemoria(),
      openaiClient,
    });

    const resultado = await detector.detectar({
      mensagem: '   ',
      historico: [],
      contexto: {},
    });

    expect(resultado.intencao).toBe(Intencao.NAO_RESPONDEU);
    expect(openaiClient.detectarIntencao).not.toHaveBeenCalled();
  });

  it('detecta intenção via GPT', async () => {
    const openaiClient: ClienteOpenAI = {
      detectarIntencao: vi.fn().mockResolvedValue({
        intencao: Intencao.QUER_AGENDAR,
        confianca: 0.91,
        motivo: 'Lead pediu para marcar demo.',
      }),
    };
    const cache = new CacheIntencaoMemoria();
    const detector = new DetectorIntencao(config, {
      logger: loggerMock,
      cache,
      openaiClient,
    });

    const resultado = await detector.detectar({
      mensagem: 'Quero agendar uma demo',
      historico: [],
      contexto: { leadId: 'lead-1' },
    });

    expect(resultado.intencao).toBe(Intencao.QUER_AGENDAR);
    expect(resultado.origem).toBe('gpt');
    expect(resultado.confianca).toBe(0.91);
    expect(openaiClient.detectarIntencao).toHaveBeenCalledOnce();
  });

  it('retorna resultado do cache na segunda chamada', async () => {
    const openaiClient: ClienteOpenAI = {
      detectarIntencao: vi.fn().mockResolvedValue({
        intencao: Intencao.QUER_MAIS_INFO,
        confianca: 0.85,
        motivo: 'Lead pediu preço.',
      }),
    };
    const cache = new CacheIntencaoMemoria();
    const detector = new DetectorIntencao(config, {
      logger: loggerMock,
      cache,
      openaiClient,
    });

    const entrada = {
      mensagem: 'Qual o preço?',
      historico: [],
      contexto: { leadId: 'lead-2' },
    };

    const primeira = await detector.detectar(entrada);
    const segunda = await detector.detectar(entrada);

    expect(primeira.origem).toBe('gpt');
    expect(segunda.origem).toBe('cache');
    expect(openaiClient.detectarIntencao).toHaveBeenCalledOnce();
  });

  it('aciona fallback quando GPT falha', async () => {
    const openaiClient: ClienteOpenAI = {
      detectarIntencao: vi.fn().mockRejectedValue(new Error('OpenAI indisponível')),
    };
    const detector = new DetectorIntencao(config, {
      logger: loggerMock,
      cache: new CacheIntencaoMemoria(),
      openaiClient,
    });

    const resultado = await detector.detectar({
      mensagem: 'Não tenho interesse',
      historico: [],
      contexto: {},
    });

    expect(resultado.origem).toBe('fallback');
    expect(resultado.intencao).toBe(Intencao.NAO_INTERESSADO);
  });

  it('sempre retorna saída validada com timestamp', async () => {
    const openaiClient: ClienteOpenAI = {
      detectarIntencao: vi.fn().mockResolvedValue({
        intencao: Intencao.DEMONSTRA_INTERESSE,
        confianca: 0.7,
        motivo: 'Lead demonstrou interesse.',
      }),
    };
    const detector = new DetectorIntencao(config, {
      logger: loggerMock,
      cache: new CacheIntencaoMemoria(),
      openaiClient,
    });

    const resultado: SaidaDeteccaoIntencao = await detector.detectar({
      mensagem: 'Isso parece interessante',
      historico: [],
      contexto: {},
    });

    expect(resultado.timestamp).toBeInstanceOf(Date);
    expect(resultado.motivo.length).toBeGreaterThan(0);
  });
});
