import { describe, expect, it } from 'vitest';

import { CachePerguntasMemoria } from './cache.js';
import type { GeradorPerguntasOutput } from './types.js';

describe('CachePerguntasMemoria', () => {
  const saida: GeradorPerguntasOutput = {
    pergunta: 'Qual é o principal objetivo que você busca alcançar com automação comercial hoje?',
    contextoEsperado: 'Entender necessidade principal.',
    camada: 1,
    timestamp: new Date('2026-06-17T12:00:00.000Z'),
    origem: 'template',
  };

  it('salva e recupera pergunta do cache', async () => {
    const cache = new CachePerguntasMemoria(60);

    await cache.set('chave-1', saida);
    const cached = await cache.get('chave-1');

    expect(cached?.camada).toBe(1);
    expect(cached?.pergunta).toBe(saida.pergunta);
  });

  it('expira entradas após TTL', async () => {
    const cache = new CachePerguntasMemoria(0);

    await cache.set('chave-2', saida, 0);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(await cache.get('chave-2')).toBeNull();
  });
});
