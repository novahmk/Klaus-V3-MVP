import { describe, expect, it } from 'vitest';

import { Intencao } from '../1-deteccao-intencao/types.js';
import { TEMPLATES_FALLBACK } from './constants.js';
import { gerarPerguntaPorTemplate } from './templates.js';
import { validarPergunta } from './validators.js';

describe('templates fallback', () => {
  const inputBase = {
    tema: 'automação comercial',
    historico: [],
    intencao: Intencao.DEMONSTRA_INTERESSE,
    clienteId: 'cliente-1',
    baseConhecimento: null,
    perguntasJaFeitas: [] as string[],
  };

  it('gera pergunta válida para camada 1', () => {
    const resultado = gerarPerguntaPorTemplate(inputBase, 1);

    expect(() => validarPergunta(resultado.pergunta)).not.toThrow();
    expect(resultado.contextoEsperado.length).toBeGreaterThan(0);
  });

  it('gera pergunta válida para camada 2', () => {
    const resultado = gerarPerguntaPorTemplate(inputBase, 2);

    expect(resultado.pergunta).toContain('automação comercial');
    expect(resultado.pergunta.endsWith('?')).toBe(true);
  });

  it('gera pergunta válida para camada 3', () => {
    const resultado = gerarPerguntaPorTemplate(inputBase, 3);

    expect(resultado.pergunta.length).toBeGreaterThanOrEqual(20);
  });

  it('todos os templates interpolados passam validação básica', () => {
    for (const camada of [1, 2, 3] as const) {
      for (const template of TEMPLATES_FALLBACK[camada]) {
        const pergunta = template.replace(/\{tema\}/g, inputBase.tema);
        expect(() => validarPergunta(pergunta)).not.toThrow();
      }
    }
  });
});
