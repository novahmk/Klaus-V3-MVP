import { describe, expect, it } from 'vitest';

import { TimeoutError, comTimeout, criarSinalDeTimeout } from './timeout.js';

describe('comTimeout', () => {
  it('devolve o valor quando a promessa resolve a tempo', async () => {
    await expect(comTimeout(Promise.resolve('ok'), 100, 'tarefa')).resolves.toBe('ok');
  });

  it('lança TimeoutError quando a promessa demora demais', async () => {
    const eterna = new Promise<string>(() => undefined);

    await expect(comTimeout(eterna, 20, 'consulta lenta')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('descreve a operação e o limite na mensagem', async () => {
    const eterna = new Promise<string>(() => undefined);

    await expect(comTimeout(eterna, 15, 'consulta lenta')).rejects.toThrow(
      'consulta lenta excedeu 15ms.',
    );
  });

  it('propaga o erro original quando a promessa falha antes do limite', async () => {
    await expect(
      comTimeout(Promise.reject(new Error('falha real')), 100, 'tarefa'),
    ).rejects.toThrow('falha real');
  });
});

describe('criarSinalDeTimeout', () => {
  it('começa sem estar abortado', () => {
    const { sinal, cancelar } = criarSinalDeTimeout(1000);

    expect(sinal.aborted).toBe(false);

    cancelar();
  });

  it('aborta ao estourar o tempo', async () => {
    const { sinal } = criarSinalDeTimeout(10);

    await new Promise((resolver) => setTimeout(resolver, 30));

    expect(sinal.aborted).toBe(true);
  });
});
