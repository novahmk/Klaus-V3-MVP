import { describe, expect, it } from 'vitest';

import { CacheIntencaoMemoria } from './cache.js';
import { Intencao, type SaidaDeteccaoIntencao } from './types.js';

describe('CacheIntencaoMemoria', () => {
  const saida: SaidaDeteccaoIntencao = {
    intencao: Intencao.QUER_MAIS_INFO,
    confianca: 0.8,
    motivo: 'Lead pediu detalhes.',
    timestamp: new Date('2026-06-17T12:00:00.000Z'),
    origem: 'gpt',
  };

  it('salva e recupera valor do cache', async () => {
    const cache = new CacheIntencaoMemoria(60);

    await cache.set('chave-1', saida);
    const cached = await cache.get('chave-1');

    expect(cached).not.toBeNull();
    expect(cached?.intencao).toBe(Intencao.QUER_MAIS_INFO);
    expect(cached?.origem).toBe('cache');
  });

  it('expira entradas após TTL', async () => {
    const cache = new CacheIntencaoMemoria(0);

    await cache.set('chave-2', saida, 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const cached = await cache.get('chave-2');

    expect(cached).toBeNull();
  });

  it('limpa cache ao desconectar', async () => {
    const cache = new CacheIntencaoMemoria(60);

    await cache.set('chave-3', saida);
    await cache.disconnect();

    const cached = await cache.get('chave-3');
    expect(cached).toBeNull();
  });
});
