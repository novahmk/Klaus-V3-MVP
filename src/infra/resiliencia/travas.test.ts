import { describe, expect, it } from 'vitest';

import { TravaPorChave } from './travas.js';

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

describe('TravaPorChave', () => {
  it('serializa execuções da mesma chave', async () => {
    const trava = new TravaPorChave();
    const eventos: string[] = [];

    const tarefa = (nome: string) =>
      trava.executar('lead-1', async () => {
        eventos.push(`inicio-${nome}`);
        await esperar(10);
        eventos.push(`fim-${nome}`);
      });

    await Promise.all([tarefa('a'), tarefa('b')]);

    expect(eventos).toEqual(['inicio-a', 'fim-a', 'inicio-b', 'fim-b']);
  });

  it('permite chaves diferentes em paralelo', async () => {
    const trava = new TravaPorChave();
    let simultaneos = 0;
    let maximo = 0;

    const tarefa = (chave: string) =>
      trava.executar(chave, async () => {
        simultaneos += 1;
        maximo = Math.max(maximo, simultaneos);
        await esperar(10);
        simultaneos -= 1;
      });

    await Promise.all([tarefa('lead-1'), tarefa('lead-2')]);

    expect(maximo).toBe(2);
  });

  it('devolve o valor da ação', async () => {
    const trava = new TravaPorChave();

    await expect(trava.executar('k', () => Promise.resolve(42))).resolves.toBe(42);
  });

  it('uma falha não trava a chave para sempre', async () => {
    const trava = new TravaPorChave();

    await expect(
      trava.executar('lead-1', () => Promise.reject(new Error('falhou'))),
    ).rejects.toThrow('falhou');

    await expect(trava.executar('lead-1', () => Promise.resolve('seguinte'))).resolves.toBe(
      'seguinte',
    );
  });

  it('libera a chave quando não há mais ninguém esperando', async () => {
    const trava = new TravaPorChave();

    await trava.executar('lead-1', () => Promise.resolve());

    expect(trava.tamanho).toBe(0);
  });
});
