import { describe, expect, it, vi } from 'vitest';

import { CONFIANCA_MINIMA_ABORDAGEM } from './constants.js';
import {
  GeracaoRespostaError,
  ValidacaoRespostaError,
  gerarResposta,
  possuiPlaceholder,
  validarResposta,
} from './gerador.js';
import type { EntradaGeracaoResposta, GeracaoRespostaDependencies } from './types.js';

function entradaBase(): EntradaGeracaoResposta {
  return {
    mensagem: 'Quanto custa?',
    sistema: 'Persona: SDR consultivo',
    historico: [{ role: 'lead', conteudo: 'Quanto custa?' }],
  };
}

function deps(resposta = 'Resposta gerada pela IA.'): GeracaoRespostaDependencies {
  return {
    clienteIA: { gerarResposta: vi.fn().mockResolvedValue(resposta) },
  };
}

describe('gerarResposta', () => {
  it('usa a abordagem pronta quando a confiança atinge o limiar', async () => {
    const dependencias = deps();

    const saida = await gerarResposta(dependencias, {
      ...entradaBase(),
      abordagem: { texto: 'Nosso plano começa em R$ 300.', confianca: CONFIANCA_MINIMA_ABORDAGEM },
    });

    expect(saida.origem).toBe('abordagem');
    expect(saida.resposta).toBe('Nosso plano começa em R$ 300.');
    expect(dependencias.clienteIA.gerarResposta).not.toHaveBeenCalled();
  });

  it('aciona a IA quando a confiança fica abaixo do limiar', async () => {
    const dependencias = deps('Depende do seu volume. Posso detalhar?');

    const saida = await gerarResposta(dependencias, {
      ...entradaBase(),
      abordagem: { texto: 'Texto fraco', confianca: 0.59 },
    });

    expect(saida.origem).toBe('gpt');
    expect(saida.resposta).toBe('Depende do seu volume. Posso detalhar?');
  });

  it('aciona a IA quando não há abordagem alguma', async () => {
    const saida = await gerarResposta(deps(), entradaBase());

    expect(saida.origem).toBe('gpt');
  });

  it('propaga falha da IA em vez de responder vazio', async () => {
    const dependencias: GeracaoRespostaDependencies = {
      clienteIA: { gerarResposta: () => Promise.reject(new Error('timeout')) },
    };

    await expect(gerarResposta(dependencias, entradaBase())).rejects.toBeInstanceOf(
      GeracaoRespostaError,
    );
  });

  it('rejeita resposta da IA com placeholder não preenchido', async () => {
    await expect(
      gerarResposta(deps('Olá {{nome}}, tudo bem?'), entradaBase()),
    ).rejects.toBeInstanceOf(ValidacaoRespostaError);
  });

  it('rejeita mensagem vazia do lead', async () => {
    await expect(
      gerarResposta(deps(), { ...entradaBase(), mensagem: '   ' }),
    ).rejects.toBeInstanceOf(ValidacaoRespostaError);
  });

  it('rejeita confiança fora do intervalo', async () => {
    await expect(
      gerarResposta(deps(), {
        ...entradaBase(),
        abordagem: { texto: 'ok', confianca: 1.5 },
      }),
    ).rejects.toBeInstanceOf(ValidacaoRespostaError);
  });
});

describe('validarResposta', () => {
  it('remove espaços das bordas', () => {
    expect(validarResposta('  texto  ')).toBe('texto');
  });

  it('rejeita resposta longa demais', () => {
    expect(() => validarResposta('a'.repeat(1201))).toThrow(ValidacaoRespostaError);
  });
});

describe('possuiPlaceholder', () => {
  it('detecta chaves duplas', () => {
    expect(possuiPlaceholder('Oi {{nome}}')).toBe(true);
  });

  it('detecta colchetes em caixa alta', () => {
    expect(possuiPlaceholder('Fale com [NOME DO VENDEDOR]')).toBe(true);
  });

  it('não acusa texto normal', () => {
    expect(possuiPlaceholder('Olá, tudo bem?')).toBe(false);
  });
});
