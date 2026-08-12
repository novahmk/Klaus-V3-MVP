import { describe, expect, it } from 'vitest';

import { Intencao } from './types.js';
import {
  ValidacaoDeteccaoIntencaoError,
  gerarChaveCache,
  mensagemEstaVazia,
  validarEntrada,
  validarRespostaGpt,
  validarSaida,
} from './validator.js';

describe('validator', () => {
  const entradaValida = {
    mensagem: 'Quero agendar uma demo',
    historico: [{ role: 'lead' as const, conteudo: 'Olá' }],
    contexto: { leadId: 'lead-1' },
  };

  it('valida entrada correta', () => {
    expect(() => validarEntrada(entradaValida)).not.toThrow();
  });

  it('rejeita mensagem inválida', () => {
    expect(() =>
      validarEntrada({
        ...entradaValida,
        mensagem: 123 as unknown as string,
      }),
    ).toThrow(ValidacaoDeteccaoIntencaoError);
  });

  it('rejeita histórico inválido', () => {
    expect(() =>
      validarEntrada({
        ...entradaValida,
        historico: [{ role: 'invalido' as 'lead', conteudo: 'teste' }],
      }),
    ).toThrow(ValidacaoDeteccaoIntencaoError);
  });

  it('valida resposta GPT correta', () => {
    const resposta = validarRespostaGpt({
      intencao: Intencao.QUER_AGENDAR,
      confianca: 0.9,
      motivo: 'Lead pediu para marcar reunião.',
    });

    expect(resposta.intencao).toBe(Intencao.QUER_AGENDAR);
    expect(resposta.confianca).toBe(0.9);
  });

  it('rejeita intenção desconhecida na resposta GPT', () => {
    expect(() =>
      validarRespostaGpt({
        intencao: 'INVALIDA',
        confianca: 0.9,
        motivo: 'teste',
      }),
    ).toThrow(ValidacaoDeteccaoIntencaoError);
  });

  it('valida saída completa', () => {
    const saida = validarSaida({
      intencao: Intencao.DEMONSTRA_INTERESSE,
      confianca: 0.75,
      motivo: 'Lead demonstrou interesse.',
      timestamp: new Date(),
      origem: 'gpt',
    });

    expect(saida.origem).toBe('gpt');
  });

  it('identifica mensagem vazia', () => {
    expect(mensagemEstaVazia('   ')).toBe(true);
    expect(mensagemEstaVazia('oi')).toBe(false);
  });

  it('gera chave de cache determinística', () => {
    const keyA = gerarChaveCache('Olá', [], { leadId: '1' });
    const keyB = gerarChaveCache('olá', [], { leadId: '1' });
    const keyC = gerarChaveCache('Olá', [], { leadId: '2' });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });
});
