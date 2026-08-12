import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from './cliente-memoria.js';
import { TABELA_REGRAS_CONVERSA } from './constants.js';
import {
  carregarRegrasConversa,
  deveEscalarParaHumano,
  formatarRegrasParaPrompt,
} from './regras.js';
import type { PersistenciaDependencies, RegrasConversa } from './types.js';

function criarDeps(cliente: ClienteMemoria): PersistenciaDependencies {
  return { cliente };
}

describe('carregarRegrasConversa', () => {
  it('lê o singleton que o dashboard edita', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_REGRAS_CONVERSA]: [
        {
          nao_prometer: ['desconto acima de 10%'],
          sempre_confirmar: ['orçamento'],
          escalar_humano_quando: ['jurídico'],
        },
      ],
    });

    const regras = await carregarRegrasConversa(criarDeps(cliente));

    expect(regras.nao_prometer).toEqual(['desconto acima de 10%']);
    expect(regras.sempre_confirmar).toEqual(['orçamento']);
    expect(regras.escalar_humano_quando).toEqual(['jurídico']);
  });

  it('retorna listas vazias quando não há registro', async () => {
    const cliente = new ClienteMemoria({ [TABELA_REGRAS_CONVERSA]: [] });

    const regras = await carregarRegrasConversa(criarDeps(cliente));

    expect(regras).toEqual({
      nao_prometer: [],
      sempre_confirmar: [],
      escalar_humano_quando: [],
    });
  });

  it('tolera colunas nulas e entradas inválidas vindas do banco', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_REGRAS_CONVERSA]: [
        {
          nao_prometer: null,
          sempre_confirmar: ['  prazo  ', '', 42],
          escalar_humano_quando: 'texto solto',
        },
      ],
    });

    const regras = await carregarRegrasConversa(criarDeps(cliente));

    expect(regras.nao_prometer).toEqual([]);
    expect(regras.sempre_confirmar).toEqual(['prazo']);
    expect(regras.escalar_humano_quando).toEqual([]);
  });
});

describe('formatarRegrasParaPrompt', () => {
  it('transforma as regras do dashboard em instruções para o agente', () => {
    const regras: RegrasConversa = {
      nao_prometer: ['prazo de entrega'],
      sempre_confirmar: ['e-mail'],
      escalar_humano_quando: ['reclamação formal'],
    };

    const prompt = formatarRegrasParaPrompt(regras);

    expect(prompt).toContain('Nunca prometa: prazo de entrega.');
    expect(prompt).toContain('Sempre confirme antes de avançar: e-mail.');
    expect(prompt).toContain('Escale para um humano quando: reclamação formal.');
  });

  it('retorna string vazia quando não há regras configuradas', () => {
    const prompt = formatarRegrasParaPrompt({
      nao_prometer: [],
      sempre_confirmar: [],
      escalar_humano_quando: [],
    });

    expect(prompt).toBe('');
  });
});

describe('deveEscalarParaHumano', () => {
  const regras: RegrasConversa = {
    nao_prometer: [],
    sempre_confirmar: [],
    escalar_humano_quando: ['advogado', 'cancelar contrato'],
  };

  it('detecta gatilho ignorando caixa', () => {
    expect(deveEscalarParaHumano(regras, 'Vou chamar meu ADVOGADO')).toBe(true);
  });

  it('não escala mensagem comum', () => {
    expect(deveEscalarParaHumano(regras, 'Quanto custa o plano?')).toBe(false);
  });
});
