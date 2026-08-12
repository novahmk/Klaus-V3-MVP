import { describe, expect, it } from 'vitest';

import { detectarIntencaoPorPalavrasChave } from './fallback.js';
import { Intencao } from './types.js';

describe('fallback', () => {
  it('detecta intenção de agendamento', () => {
    const resultado = detectarIntencaoPorPalavrasChave(
      'Podemos marcar uma reunião amanhã?',
    );

    expect(resultado.intencao).toBe(Intencao.QUER_AGENDAR);
    expect(resultado.confianca).toBeGreaterThan(0.7);
  });

  it('detecta objeção de preço', () => {
    const resultado = detectarIntencaoPorPalavrasChave('Está muito caro para nós.');

    expect(resultado.intencao).toBe(Intencao.TEM_OBJECAO);
  });

  it('detecta pedido de informação', () => {
    const resultado = detectarIntencaoPorPalavrasChave('Qual o preço do plano?');

    expect(resultado.intencao).toBe(Intencao.QUER_MAIS_INFO);
  });

  it('detecta falta de interesse', () => {
    const resultado = detectarIntencaoPorPalavrasChave('Não tenho interesse, obrigado.');

    expect(resultado.intencao).toBe(Intencao.NAO_INTERESSADO);
  });

  it('detecta interesse positivo', () => {
    const resultado = detectarIntencaoPorPalavrasChave('Isso parece interessante!');

    expect(resultado.intencao).toBe(Intencao.DEMONSTRA_INTERESSE);
  });

  it('retorna NAO_RESPONDEU para mensagem vazia', () => {
    const resultado = detectarIntencaoPorPalavrasChave('   ');

    expect(resultado.intencao).toBe(Intencao.NAO_RESPONDEU);
    expect(resultado.confianca).toBeGreaterThan(0.9);
  });

  it('retorna NAO_RESPONDEU quando não encontra padrão', () => {
    const resultado = detectarIntencaoPorPalavrasChave('xyz abc 123');

    expect(resultado.intencao).toBe(Intencao.NAO_RESPONDEU);
  });
});
