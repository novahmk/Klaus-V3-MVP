import { describe, expect, it } from 'vitest';

import { Disjuntor, DisjuntorAbertoError } from './disjuntor.js';

function falhar(): Promise<never> {
  return Promise.reject(new Error('dependência fora'));
}

describe('Disjuntor', () => {
  it('começa fechado e deixa passar', async () => {
    const disjuntor = new Disjuntor({ nome: 'teste' });

    await expect(disjuntor.executar(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(disjuntor.estado).toBe('fechado');
  });

  it('abre após atingir o limite de falhas seguidas', async () => {
    const disjuntor = new Disjuntor({ nome: 'teste', limiteFalhas: 3 });

    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      await expect(disjuntor.executar(falhar)).rejects.toThrow('dependência fora');
    }

    expect(disjuntor.estado).toBe('aberto');
  });

  it('falha rápido enquanto aberto, sem chamar a dependência', async () => {
    const disjuntor = new Disjuntor({ nome: 'teste', limiteFalhas: 1 });
    let chamadas = 0;

    await expect(disjuntor.executar(falhar)).rejects.toThrow();

    await expect(
      disjuntor.executar(() => {
        chamadas += 1;
        return Promise.resolve('nunca');
      }),
    ).rejects.toBeInstanceOf(DisjuntorAbertoError);

    expect(chamadas).toBe(0);
  });

  it('sucesso zera a contagem de falhas', async () => {
    const disjuntor = new Disjuntor({ nome: 'teste', limiteFalhas: 3 });

    await expect(disjuntor.executar(falhar)).rejects.toThrow();
    await expect(disjuntor.executar(falhar)).rejects.toThrow();
    await disjuntor.executar(() => Promise.resolve('ok'));
    await expect(disjuntor.executar(falhar)).rejects.toThrow();

    expect(disjuntor.estado).toBe('fechado');
  });

  it('passa a meio-aberto após o tempo de reabertura', async () => {
    let agora = 1000;
    const disjuntor = new Disjuntor({
      nome: 'teste',
      limiteFalhas: 1,
      tempoDeReaberturaMs: 5000,
      agora: () => agora,
    });

    await expect(disjuntor.executar(falhar)).rejects.toThrow();
    expect(disjuntor.estado).toBe('aberto');

    agora += 5001;

    expect(disjuntor.estado).toBe('meio-aberto');
  });

  it('volta a fechar quando a dependência se recupera', async () => {
    let agora = 1000;
    const disjuntor = new Disjuntor({
      nome: 'teste',
      limiteFalhas: 1,
      tempoDeReaberturaMs: 100,
      agora: () => agora,
    });

    await expect(disjuntor.executar(falhar)).rejects.toThrow();
    agora += 200;

    await disjuntor.executar(() => Promise.resolve('voltou'));

    expect(disjuntor.estado).toBe('fechado');
  });
});
