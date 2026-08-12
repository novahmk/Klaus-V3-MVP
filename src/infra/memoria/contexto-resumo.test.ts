import { describe, expect, it } from 'vitest';

import { montarContexto } from './contexto.js';
import type { EntradaContexto } from './contexto.js';
import type { MensagemHistorico } from './historico.js';
import type { LeadFato } from './fatos.js';

function msg(conteudo: string, role: 'lead' | 'klaus' = 'lead'): MensagemHistorico {
  return { role, conteudo, timestamp: new Date('2026-08-12T10:00:00.000Z') };
}

function entrada(historico: MensagemHistorico[], orcamentoTokens: number): EntradaContexto {
  return {
    configuracao: { persona: 'SDR', objetivo: 'Agendar demo' },
    regras: { nao_prometer: [], sempre_confirmar: [], escalar_humano_quando: [] },
    estagio: 'descoberta',
    historico,
    orcamentoTokens,
  };
}

describe('resumo dentro do contexto', () => {
  it('não gera resumo quando todo o histórico cabe', () => {
    const contexto = montarContexto(entrada([msg('Oi'), msg('Tudo bem?', 'klaus')], 2000));

    expect(contexto.resumo).toBe('');
    expect(contexto.mensagensDescartadas).toBe(0);
  });

  it('preserva no resumo um fato dito no início da conversa', () => {
    const historico = [
      msg('Preciso reduzir o custo de frete da minha operação.'),
      ...Array.from({ length: 25 }, (_, indice) =>
        msg(`Assunto irrelevante número ${indice} sobre outro tema qualquer.`),
      ),
      msg('E aí, o que você acha?'),
    ];

    const contexto = montarContexto(entrada(historico, 200));

    expect(contexto.mensagensDescartadas).toBeGreaterThan(0);
    expect(contexto.sistema).toContain('Resumo da conversa até aqui');
    expect(contexto.resumo).toContain('frete');
  });

  it('mantém o resumo dentro do orçamento total', () => {
    const historico = Array.from({ length: 80 }, (_, indice) =>
      msg(`Mensagem ${indice} com bastante conteúdo para ocupar espaço no orçamento.`),
    );

    const contexto = montarContexto(entrada(historico, 300));

    expect(contexto.tokensEstimados).toBeLessThanOrEqual(300);
  });

  it('coloca o resumo no prompt de sistema, não no histórico', () => {
    const historico = Array.from({ length: 40 }, (_, indice) =>
      msg(`Mensagem ${indice} sobre custo de frete e prazo de entrega.`),
    );

    const contexto = montarContexto(entrada(historico, 300));

    expect(contexto.sistema).toContain(contexto.resumo.slice(0, 20));
    expect(contexto.historico.every((mensagem) => mensagem.role !== 'system')).toBe(true);
  });
});

describe('fatos dentro do contexto', () => {
  const fato: LeadFato = {
    id: 'f1',
    lead_id: '11111111-1111-4111-8111-111111111111',
    conteudo: 'Não pode ser contatado antes das 18h',
    categoria: 'restricao',
    importancia: 0.95,
    criado_em: '2026-08-12T10:00:00.000Z',
    ultimo_uso_em: null,
  };

  it('injeta os fatos do lead no prompt de sistema', () => {
    const contexto = montarContexto({ ...entrada([msg('Oi')], 2000), fatos: [fato] });

    expect(contexto.sistema).toContain('Fatos conhecidos deste lead');
    expect(contexto.sistema).toContain('Não pode ser contatado antes das 18h');
  });

  it('omite o bloco quando não há fatos', () => {
    const contexto = montarContexto(entrada([msg('Oi')], 2000));

    expect(contexto.sistema).not.toContain('Fatos conhecidos deste lead');
  });

  it('mantém os fatos mesmo quando o histórico é truncado', () => {
    const historico = Array.from({ length: 60 }, (_, indice) =>
      msg(`Mensagem longa número ${indice} para forçar o truncamento do histórico.`),
    );

    const contexto = montarContexto({ ...entrada(historico, 300), fatos: [fato] });

    expect(contexto.mensagensDescartadas).toBeGreaterThan(0);
    expect(contexto.sistema).toContain('Não pode ser contatado antes das 18h');
  });
});
