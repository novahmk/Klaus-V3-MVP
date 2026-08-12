import { describe, expect, it } from 'vitest';

import { FilaMemoria } from './fila-memoria.js';
import { Trabalhador } from './trabalhador.js';

describe('Trabalhador', () => {
  it('processa o que foi enfileirado', async () => {
    const fila = new FilaMemoria<string>();
    const processados: string[] = [];
    const trabalhador = new Trabalhador(fila, (payload) => {
      processados.push(payload);
      return Promise.resolve();
    });

    fila.enfileirar('a');
    fila.enfileirar('b');
    trabalhador.notificar();

    await trabalhador.aguardar();

    expect(processados).toEqual(['a', 'b']);
  });

  it('notificar não bloqueia quem chamou', () => {
    const fila = new FilaMemoria<string>();
    const trabalhador = new Trabalhador(fila, () => new Promise((r) => setTimeout(r, 50)));

    fila.enfileirar('lento');

    const inicio = Date.now();
    trabalhador.notificar();

    expect(Date.now() - inicio).toBeLessThan(20);
  });

  it('processa itens enfileirados durante a drenagem', async () => {
    const fila = new FilaMemoria<string>();
    const processados: string[] = [];
    const trabalhador = new Trabalhador(fila, (payload) => {
      processados.push(payload);

      if (payload === 'primeiro') {
        fila.enfileirar('durante');
      }

      return Promise.resolve();
    });

    fila.enfileirar('primeiro');
    trabalhador.notificar();

    await trabalhador.aguardar();

    expect(processados).toEqual(['primeiro', 'durante']);
  });

  it('não roda duas drenagens em paralelo', async () => {
    const fila = new FilaMemoria<string>();
    let simultaneos = 0;
    let maximo = 0;

    const trabalhador = new Trabalhador(fila, async () => {
      simultaneos += 1;
      maximo = Math.max(maximo, simultaneos);
      await new Promise((r) => setTimeout(r, 5));
      simultaneos -= 1;
    });

    fila.enfileirar('a');
    fila.enfileirar('b');
    trabalhador.notificar();
    trabalhador.notificar();

    await trabalhador.aguardar();

    expect(maximo).toBe(1);
  });

  it('uma falha não impede o processamento dos demais', async () => {
    const fila = new FilaMemoria<string>({ maxTentativas: 1 });
    const processados: string[] = [];

    const trabalhador = new Trabalhador(fila, (payload) => {
      if (payload === 'ruim') {
        return Promise.reject(new Error('falhou'));
      }

      processados.push(payload);

      return Promise.resolve();
    });

    fila.enfileirar('ruim');
    fila.enfileirar('bom');
    trabalhador.notificar();

    await trabalhador.aguardar();

    expect(processados).toEqual(['bom']);
    expect(fila.deadLetter).toHaveLength(1);
  });
});
