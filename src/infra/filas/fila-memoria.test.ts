import { describe, expect, it } from 'vitest';

import { FilaMemoria } from './fila-memoria.js';

describe('FilaMemoria', () => {
  it('processa as tarefas enfileiradas', async () => {
    const fila = new FilaMemoria<string>();
    const processados: string[] = [];

    fila.enfileirar('a');
    fila.enfileirar('b');

    const resultado = await fila.processar((payload) => {
      processados.push(payload);
      return Promise.resolve();
    });

    expect(processados).toEqual(['a', 'b']);
    expect(resultado.processadas).toBe(2);
    expect(fila.tamanho).toBe(0);
  });

  it('reenfileira a tarefa que falhou e conclui na tentativa seguinte', async () => {
    const fila = new FilaMemoria<string>();
    let tentativas = 0;

    fila.enfileirar('instavel');

    const resultado = await fila.processar(() => {
      tentativas += 1;

      if (tentativas === 1) {
        return Promise.reject(new Error('falha transitória'));
      }

      return Promise.resolve();
    });

    expect(tentativas).toBe(2);
    expect(resultado.processadas).toBe(1);
    expect(fila.deadLetter).toHaveLength(0);
  });

  it('move para dead-letter após esgotar as tentativas', async () => {
    const fila = new FilaMemoria<string>({ maxTentativas: 2 });

    fila.enfileirar('sempre-falha');

    await fila.processar(() => Promise.reject(new Error('erro permanente')));

    expect(fila.deadLetter).toHaveLength(1);
    expect(fila.deadLetter[0]?.payload).toBe('sempre-falha');
    expect(fila.tamanho).toBe(0);
  });

  it('não descarta tarefa em silêncio', async () => {
    const fila = new FilaMemoria<number>({ maxTentativas: 1 });

    fila.enfileirar(1);
    fila.enfileirar(2);

    const resultado = await fila.processar((valor) =>
      valor === 1 ? Promise.reject(new Error('erro')) : Promise.resolve(),
    );

    expect(resultado.processadas).toBe(1);
    expect(resultado.falhas).toBe(1);
    expect(fila.deadLetter.map((tarefa) => tarefa.payload)).toEqual([1]);
  });

  it('mantém a fila vazia após processar', async () => {
    const fila = new FilaMemoria<string>();

    fila.enfileirar('x');
    await fila.processar(() => Promise.resolve());

    expect(fila.tamanho).toBe(0);
  });
});
