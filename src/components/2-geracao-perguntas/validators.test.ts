import { describe, expect, it } from 'vitest';

import { Intencao } from '../1-deteccao-intencao/types.js';
import {
  calcularSimilaridadeJaccard,
  determinarCamada,
  ehPerguntaAberta,
  possuiPlaceholder,
  validarEntrada,
  validarPergunta,
  ValidacaoGeradorPerguntasError,
} from './validators.js';

describe('validators', () => {
  const entradaValida = {
    tema: 'automação comercial',
    historico: [{ role: 'lead' as const, conteudo: 'Olá' }],
    intencao: Intencao.DEMONSTRA_INTERESSE,
    clienteId: 'cliente-1',
    baseConhecimento: { produto: 'CRM' },
    perguntasJaFeitas: [],
  };

  it('determina camada conforme algoritmo oficial', () => {
    expect(determinarCamada(0)).toBe(1);
    expect(determinarCamada(1)).toBe(2);
    expect(determinarCamada(2)).toBe(3);
    expect(determinarCamada(5)).toBe(3);
  });

  it('valida entrada correta', () => {
    expect(() => validarEntrada(entradaValida)).not.toThrow();
  });

  it('rejeita tema vazio', () => {
    expect(() => validarEntrada({ ...entradaValida, tema: '  ' })).toThrow(
      ValidacaoGeradorPerguntasError,
    );
  });

  it('aceita pergunta aberta válida', () => {
    const pergunta =
      'Qual é o principal desafio que você busca resolver com automação comercial hoje?';

    expect(() => validarPergunta(pergunta)).not.toThrow();
    expect(ehPerguntaAberta(pergunta)).toBe(true);
  });

  it('rejeita pergunta sem interrogação', () => {
    expect(() =>
      validarPergunta('Como você lida com automação comercial no dia a dia'),
    ).toThrow(ValidacaoGeradorPerguntasError);
  });

  it('rejeita pergunta fechada', () => {
    const pergunta = 'Você gostaria de agendar uma demo conosco amanhã à tarde?';

    expect(ehPerguntaAberta(pergunta)).toBe(false);
    expect(() => validarPergunta(pergunta)).toThrow(ValidacaoGeradorPerguntasError);
  });

  it('rejeita placeholder', () => {
    expect(possuiPlaceholder('Qual o objetivo de {nome} com CRM?')).toBe(true);
    expect(() =>
      validarPergunta('Qual o objetivo de {nome} com CRM neste trimestre?'),
    ).toThrow(ValidacaoGeradorPerguntasError);
  });

  it('rejeita pergunta repetida', () => {
    const pergunta =
      'Como a automação comercial impacta os resultados do seu time neste momento?';

    expect(() => validarPergunta(pergunta, [pergunta])).toThrow(
      ValidacaoGeradorPerguntasError,
    );
  });

  it('rejeita similaridade acima de 70%', () => {
    const anterior =
      'Como a automação comercial impacta os resultados do seu time neste momento?';
    const similar =
      'Como a automação comercial impacta os resultados do seu time neste cenário?';

    expect(calcularSimilaridadeJaccard(anterior, similar)).toBeGreaterThan(0.7);
    expect(() => validarPergunta(similar, [anterior])).toThrow(
      ValidacaoGeradorPerguntasError,
    );
  });

  it('rejeita pergunta curta demais', () => {
    expect(() => validarPergunta('Como vai?')).toThrow(ValidacaoGeradorPerguntasError);
  });
});
