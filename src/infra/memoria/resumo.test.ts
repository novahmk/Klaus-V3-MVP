import { describe, expect, it } from 'vitest';

import { dividirEmFrases, resumirMensagens, truncarPorTokens } from './resumo.js';
import type { MensagemHistorico } from './historico.js';

function msg(conteudo: string, role: 'lead' | 'klaus' = 'lead'): MensagemHistorico {
  return { role, conteudo, timestamp: new Date('2026-08-12T10:00:00.000Z') };
}

describe('dividirEmFrases', () => {
  it('separa por pontuação final', () => {
    expect(dividirEmFrases('Sou gerente de TI. Trabalho com logística.')).toEqual([
      'Sou gerente de TI.',
      'Trabalho com logística.',
    ]);
  });

  it('descarta fragmentos curtos demais', () => {
    expect(dividirEmFrases('Ok. Sou gerente de operações.')).toEqual([
      'Sou gerente de operações.',
    ]);
  });
});

describe('resumirMensagens', () => {
  it('retorna vazio quando não há mensagens', () => {
    expect(resumirMensagens([])).toBe('');
  });

  it('mantém tudo quando cabe no limite de frases', () => {
    const resumo = resumirMensagens([msg('Sou gerente de TI na Acme.')]);

    expect(resumo).toBe('lead: Sou gerente de TI na Acme.');
  });

  it('aproveita mensagem sem pontuação, comum no WhatsApp', () => {
    const resumo = resumirMensagens([msg('sou gerente de operações na Acme')]);

    expect(resumo).toContain('sou gerente de operações na Acme');
  });

  it('preserva o fato relevante repetido ao longo da conversa', () => {
    const mensagens = [
      msg('Trabalho com logística e preciso reduzir custo de frete.'),
      msg('O frete hoje pesa demais no custo total.'),
      msg('Falei com meu sócio sobre o custo de frete.'),
      msg('Qual a previsão do tempo?'),
      msg('Vi um jogo ontem à noite.'),
      msg('Gosto de café pela manhã.'),
      msg('Preciso resolver o custo de frete ainda neste trimestre.'),
    ];

    const resumo = resumirMensagens(mensagens, 3);

    expect(resumo).toContain('frete');
  });

  it('mantém a ordem cronológica das frases escolhidas', () => {
    const mensagens = [
      msg('Primeiro falamos sobre custo de frete.'),
      msg('Depois falamos sobre prazo de entrega.'),
      msg('Por fim falamos sobre custo de frete e prazo.'),
    ];

    const resumo = resumirMensagens(mensagens, 2);
    const posicaoPrimeiro = resumo.indexOf('Primeiro');
    const posicaoPorFim = resumo.indexOf('Por fim');

    if (posicaoPrimeiro !== -1 && posicaoPorFim !== -1) {
      expect(posicaoPrimeiro).toBeLessThan(posicaoPorFim);
    }
  });

  it('é determinístico entre execuções', () => {
    const mensagens = [
      msg('Custo de frete é o problema principal.'),
      msg('Prazo de entrega também incomoda bastante.'),
      msg('Equipe de compras tem três pessoas hoje.'),
      msg('Orçamento anual gira em torno de cem mil.'),
    ];

    expect(resumirMensagens(mensagens, 2)).toBe(resumirMensagens(mensagens, 2));
  });

  it('identifica o papel de quem falou', () => {
    const resumo = resumirMensagens([msg('Posso ajudar com isso hoje.', 'klaus')]);

    expect(resumo.startsWith('klaus:')).toBe(true);
  });
});

describe('truncarPorTokens', () => {
  it('não corta texto que já cabe', () => {
    expect(truncarPorTokens('texto curto', 100)).toBe('texto curto');
  });

  it('corta respeitando o limite de tokens', () => {
    const resultado = truncarPorTokens('a'.repeat(400), 10);

    expect(resultado.length).toBeLessThanOrEqual(40);
  });

  it('não parte palavra ao meio', () => {
    const resultado = truncarPorTokens('palavra1 palavra2 palavra3', 3);

    expect(resultado.endsWith('palavra1')).toBe(true);
  });

  it('devolve vazio com limite zero', () => {
    expect(truncarPorTokens('qualquer', 0)).toBe('');
  });
});
