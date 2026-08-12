import { describe, expect, it, vi } from 'vitest';

import { Intencao } from '../1-deteccao-intencao/types.js';
import { ClienteMemoria } from '../../infra/persistencia/cliente-memoria.js';
import { TABELA_LEADS, TABELA_MENSAGENS } from '../../infra/persistencia/constants.js';
import { TABELA_LEAD_FATOS, listarFatosDoLead, registrarFato } from '../../infra/memoria/fatos.js';
import { processarMensagem } from './orquestrador.js';
import type { OrquestradorDependencies } from './orquestrador.js';

function criarDeps(
  cliente: ClienteMemoria,
  overrides: Partial<OrquestradorDependencies> = {},
): OrquestradorDependencies {
  return {
    persistencia: { cliente },
    detector: {
      detectar: () =>
        Promise.resolve({ intencao: Intencao.DEMONSTRA_INTERESSE, confianca: 0.9 }),
    },
    gerador: {
      gerar: () => Promise.resolve({ resposta: 'Certo, posso ajudar.', origem: 'gpt' as const }),
    },
    configuracao: {
      carregar: () =>
        Promise.resolve({
          agente: { persona: 'SDR', objetivo: 'Agendar demo' },
          regras: { nao_prometer: [], sempre_confirmar: [], escalar_humano_quando: [] },
        }),
    },
    enviar: () => Promise.resolve(),
    ...overrides,
  };
}

function clienteVazio(): ClienteMemoria {
  return new ClienteMemoria({
    [TABELA_LEADS]: [],
    [TABELA_MENSAGENS]: [],
    [TABELA_LEAD_FATOS]: [],
  });
}

describe('memória do lead no orquestrador', () => {
  it('apaga os fatos do lead quando ele pede para parar', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente, {
      detector: {
        detectar: () => Promise.resolve({ intencao: Intencao.NAO_INTERESSADO, confianca: 0.99 }),
      },
    });

    // Primeiro turno cria o lead.
    await processarMensagem(criarDeps(cliente), {
      telefone: '5511999998888',
      texto: 'Tenho interesse',
    });

    const leadId = String(cliente.linhas(TABELA_LEADS)[0]?.['id']);
    await registrarFato({ cliente }, leadId, {
      conteudo: 'É gerente de logística',
      categoria: 'qualificacao',
    });

    await expect(listarFatosDoLead({ cliente }, leadId)).resolves.toHaveLength(1);

    const resultado = await processarMensagem(deps, {
      telefone: '5511999998888',
      texto: 'Não quero mais receber mensagens',
    });

    expect(resultado.estagio).toBe('encerrado');
    await expect(listarFatosDoLead({ cliente }, leadId)).resolves.toEqual([]);
  });

  it('preserva as mensagens da conversa após o expurgo dos fatos', async () => {
    const cliente = clienteVazio();

    await processarMensagem(criarDeps(cliente), {
      telefone: '5511999998888',
      texto: 'Tenho interesse',
    });

    await processarMensagem(
      criarDeps(cliente, {
        detector: {
          detectar: () => Promise.resolve({ intencao: Intencao.NAO_INTERESSADO, confianca: 0.99 }),
        },
      }),
      { telefone: '5511999998888', texto: 'Pode parar de me mandar mensagem' },
    );

    expect(cliente.linhas(TABELA_MENSAGENS).length).toBeGreaterThan(0);
  });

  it('não apaga fatos em uma conversa normal', async () => {
    const cliente = clienteVazio();

    await processarMensagem(criarDeps(cliente), {
      telefone: '5511999998888',
      texto: 'Quero saber mais',
    });

    const leadId = String(cliente.linhas(TABELA_LEADS)[0]?.['id']);
    await registrarFato({ cliente }, leadId, { conteudo: 'Trabalha com frete' });

    await processarMensagem(criarDeps(cliente), {
      telefone: '5511999998888',
      texto: 'Como funciona o frete de vocês?',
    });

    await expect(listarFatosDoLead({ cliente }, leadId)).resolves.toHaveLength(1);
  });

  it('usa os fatos relevantes ao montar o contexto da resposta', async () => {
    const cliente = clienteVazio();
    const gerar = vi
      .fn()
      .mockResolvedValue({ resposta: 'Posso ajudar com frete.', origem: 'gpt' as const });

    await processarMensagem(criarDeps(cliente), {
      telefone: '5511999998888',
      texto: 'Oi',
    });

    const leadId = String(cliente.linhas(TABELA_LEADS)[0]?.['id']);
    await registrarFato({ cliente }, leadId, {
      conteudo: 'Precisa reduzir custo de frete',
      categoria: 'qualificacao',
    });

    await processarMensagem(criarDeps(cliente, { gerador: { gerar } }), {
      telefone: '5511999998888',
      texto: 'Qual o custo de frete que consigo?',
    });

    const chamada = gerar.mock.calls[0]?.[0] as { sistema: string };
    expect(chamada.sistema).toContain('Precisa reduzir custo de frete');
  });
});
