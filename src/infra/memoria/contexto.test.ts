import { describe, expect, it } from 'vitest';

import type { RegrasConversa } from '../persistencia/index.js';
import { estimarTokens, montarContexto, montarPromptSistema } from './contexto.js';
import type { EntradaContexto } from './contexto.js';
import type { MensagemHistorico } from './historico.js';

const regrasVazias: RegrasConversa = {
  nao_prometer: [],
  sempre_confirmar: [],
  escalar_humano_quando: [],
};

function mensagem(conteudo: string, role: 'lead' | 'klaus' = 'lead'): MensagemHistorico {
  return { role, conteudo, timestamp: new Date('2026-08-12T10:00:00.000Z') };
}

function entradaBase(): EntradaContexto {
  return {
    configuracao: { persona: 'SDR consultivo', objetivo: 'Agendar demonstração' },
    regras: regrasVazias,
    estagio: 'descoberta',
    historico: [],
  };
}

describe('montarPromptSistema', () => {
  it('inclui persona, objetivo e estágio atual', () => {
    const prompt = montarPromptSistema(entradaBase());

    expect(prompt).toContain('Persona: SDR consultivo');
    expect(prompt).toContain('Objetivo: Agendar demonstração');
    expect(prompt).toContain('Estágio atual da conversa: descoberta');
  });

  it('injeta as regras vindas do banco', () => {
    const prompt = montarPromptSistema({
      ...entradaBase(),
      regras: {
        nao_prometer: ['desconto'],
        sempre_confirmar: ['e-mail'],
        escalar_humano_quando: ['jurídico'],
      },
    });

    expect(prompt).toContain('Nunca prometa: desconto.');
    expect(prompt).toContain('Sempre confirme antes de avançar: e-mail.');
    expect(prompt).toContain('Escale para um humano quando: jurídico.');
  });

  it('omite campos opcionais vazios', () => {
    const prompt = montarPromptSistema({
      ...entradaBase(),
      configuracao: { persona: 'p', objetivo: 'o', tomDeVoz: '   ' },
    });

    expect(prompt).not.toContain('Tom de voz');
  });
});

describe('montarContexto', () => {
  it('preserva todo o histórico quando cabe no orçamento', () => {
    const contexto = montarContexto({
      ...entradaBase(),
      historico: [mensagem('Oi'), mensagem('Tudo bem?', 'klaus')],
    });

    expect(contexto.historico).toHaveLength(2);
    expect(contexto.mensagensDescartadas).toBe(0);
  });

  it('descarta as mensagens mais antigas ao estourar o orçamento', () => {
    const contexto = montarContexto({
      ...entradaBase(),
      historico: [mensagem('A'.repeat(400)), mensagem('B'.repeat(400)), mensagem('recente')],
      orcamentoTokens: 60,
    });

    expect(contexto.historico).toHaveLength(1);
    expect(contexto.historico[0]?.conteudo).toBe('recente');
    expect(contexto.mensagensDescartadas).toBe(2);
  });

  it('mantém a ordem cronológica após o truncamento', () => {
    const contexto = montarContexto({
      ...entradaBase(),
      historico: [mensagem('antiga'), mensagem('meio'), mensagem('nova')],
      orcamentoTokens: 100,
    });

    expect(contexto.historico.map((item) => item.conteudo)).toEqual(['antiga', 'meio', 'nova']);
  });

  it('nunca ultrapassa o orçamento informado', () => {
    const contexto = montarContexto({
      ...entradaBase(),
      historico: Array.from({ length: 50 }, (_, indice) => mensagem(`mensagem ${indice}`)),
      orcamentoTokens: 120,
    });

    expect(contexto.tokensEstimados).toBeLessThanOrEqual(120);
  });

  it('devolve histórico vazio quando nem o prompt de sistema cabe', () => {
    const contexto = montarContexto({
      ...entradaBase(),
      historico: [mensagem('qualquer coisa')],
      orcamentoTokens: 1,
    });

    expect(contexto.historico).toEqual([]);
    expect(contexto.mensagensDescartadas).toBe(1);
  });
});

describe('estimarTokens', () => {
  it('estima proporcionalmente ao tamanho do texto', () => {
    expect(estimarTokens('abcd')).toBe(1);
    expect(estimarTokens('a'.repeat(400))).toBe(100);
  });
});
