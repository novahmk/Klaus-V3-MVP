import { describe, expect, it, vi } from 'vitest';

import { Intencao } from '../1-deteccao-intencao/types.js';
import { CachePerguntasMemoria } from './cache.js';
import { GeradorPerguntas } from './generator.js';
import type { ClienteOpenAIPerguntas, Logger } from './types.js';

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

const inputBase = {
  tema: 'automação comercial',
  historico: [{ role: 'lead' as const, conteudo: 'Isso parece interessante' }],
  intencao: Intencao.DEMONSTRA_INTERESSE,
  clienteId: 'cliente-1',
  baseConhecimento: { segmento: 'SaaS' },
  perguntasJaFeitas: [] as string[],
};

describe('GeradorPerguntas', () => {
  it('retorna camada 1 na primeira pergunta', async () => {
    const openaiClient: ClienteOpenAIPerguntas = {
      gerarPergunta: vi.fn().mockResolvedValue({
        pergunta:
          'Qual é o principal objetivo que você busca alcançar com automação comercial neste trimestre?',
        contextoEsperado: 'Entender necessidade principal.',
      }),
    };

    const gerador = new GeradorPerguntas(config, {
      logger: loggerMock,
      cache: new CachePerguntasMemoria(),
      openaiClient,
    });

    const resultado = await gerador.gerar(inputBase);

    expect(resultado.camada).toBe(1);
    expect(resultado.origem).toBe('gpt');
  });

  it('retorna camada 2 na segunda pergunta', async () => {
    const openaiClient: ClienteOpenAIPerguntas = {
      gerarPergunta: vi.fn().mockResolvedValue({
        pergunta:
          'O que mais pesa na sua decisão quando você pensa em avançar com automação comercial?',
        contextoEsperado: 'Identificar objeções.',
      }),
    };

    const gerador = new GeradorPerguntas(config, {
      logger: loggerMock,
      cache: new CachePerguntasMemoria(),
      openaiClient,
    });

    const resultado = await gerador.gerar({
      ...inputBase,
      perguntasJaFeitas: [
        'Qual é o principal objetivo que você busca alcançar com automação comercial hoje?',
      ],
    });

    expect(resultado.camada).toBe(2);
  });

  it('retorna camada 3 a partir da terceira pergunta', async () => {
    const openaiClient: ClienteOpenAIPerguntas = {
      gerarPergunta: vi.fn().mockResolvedValue({
        pergunta:
          'Como você imagina que uma conversa com nosso especialista poderia destravar seu próximo passo?',
        contextoEsperado: 'Confirmar prontidão.',
      }),
    };

    const gerador = new GeradorPerguntas(config, {
      logger: loggerMock,
      cache: new CachePerguntasMemoria(),
      openaiClient,
    });

    const resultado = await gerador.gerar({
      ...inputBase,
      perguntasJaFeitas: [
        'Qual é o principal objetivo que você busca alcançar com automação comercial hoje?',
        'O que mais pesa na sua decisão quando você pensa em avançar com automação comercial?',
      ],
    });

    expect(resultado.camada).toBe(3);
  });

  it('usa fallback template quando GPT falha', async () => {
    const openaiClient: ClienteOpenAIPerguntas = {
      gerarPergunta: vi.fn().mockRejectedValue(new Error('OpenAI indisponível')),
    };

    const gerador = new GeradorPerguntas(config, {
      logger: loggerMock,
      cache: new CachePerguntasMemoria(),
      openaiClient,
    });

    const resultado = await gerador.gerar(inputBase);

    expect(resultado.origem).toBe('template');
    expect(resultado.pergunta.endsWith('?')).toBe(true);
  });

  it('usa fallback quando GPT retorna pergunta inválida', async () => {
    const openaiClient: ClienteOpenAIPerguntas = {
      gerarPergunta: vi.fn().mockResolvedValue({
        pergunta: 'Você gostaria de agendar?',
        contextoEsperado: 'Teste',
      }),
    };

    const gerador = new GeradorPerguntas(config, {
      logger: loggerMock,
      cache: new CachePerguntasMemoria(),
      openaiClient,
    });

    const resultado = await gerador.gerar(inputBase);

    expect(resultado.origem).toBe('template');
  });

  it('retorna do cache na segunda chamada idêntica', async () => {
    const openaiClient: ClienteOpenAIPerguntas = {
      gerarPergunta: vi.fn().mockResolvedValue({
        pergunta:
          'Qual é o principal objetivo que você busca alcançar com automação comercial neste trimestre?',
        contextoEsperado: 'Entender necessidade principal.',
      }),
    };

    const cache = new CachePerguntasMemoria();
    const gerador = new GeradorPerguntas(config, {
      logger: loggerMock,
      cache,
      openaiClient,
    });

    const primeira = await gerador.gerar(inputBase);
    const segunda = await gerador.gerar(inputBase);

    expect(primeira.origem).toBe('gpt');
    expect(segunda.origem).toBe('gpt');
    expect(openaiClient.gerarPergunta).toHaveBeenCalledOnce();
  });
});
