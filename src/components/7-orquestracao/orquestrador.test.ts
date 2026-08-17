import { describe, expect, it, vi } from 'vitest';

import { Intencao } from '../1-deteccao-intencao/types.js';
import { ClienteMemoria } from '../../infra/persistencia/cliente-memoria.js';
import { TABELA_LEADS, TABELA_MENSAGENS } from '../../infra/persistencia/constants.js';
import type { Lead } from '../../infra/persistencia/index.js';
import { processarMensagem } from './orquestrador.js';
import type { OrquestradorDependencies } from './orquestrador.js';

function criarDeps(
  cliente: ClienteMemoria,
  overrides: Partial<OrquestradorDependencies> = {},
): OrquestradorDependencies {
  return {
    persistencia: {
      cliente,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
    },
    detector: {
      detectar: () =>
        Promise.resolve({ intencao: Intencao.DEMONSTRA_INTERESSE, confianca: 0.9 }),
    },
    gerador: {
      gerar: () => Promise.resolve({ resposta: 'Claro, posso explicar.', origem: 'gpt' as const }),
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
  return new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });
}

const TELEFONE_INICIADO = '5511999998888';

function clienteComLeadIniciado(estagio = 'abertura'): ClienteMemoria {
  return new ClienteMemoria({
    [TABELA_LEADS]: [
      {
        id: '99999999-9999-4999-8999-999999999999',
        telefone: TELEFONE_INICIADO,
        nome: null,
        controle_manual: false,
        estagio,
      },
    ],
    [TABELA_MENSAGENS]: [],
  });
}

describe('processarMensagem', () => {
  it('ignora número sem conversa iniciada e não cria lead nem responde', async () => {
    const cliente = clienteVazio();
    const enviar = vi.fn();
    const detectar = vi.fn();
    const deps = criarDeps(cliente, { enviar, detector: { detectar } });

    const resultado = await processarMensagem(deps, {
      telefone: '5511777776666',
      texto: 'Oi, vi vocês no Instagram',
      waMessageId: 'wamid.ANTIGA',
    });

    expect(resultado.respondeu).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
    expect(detectar).not.toHaveBeenCalled();
    expect(cliente.linhas(TABELA_LEADS)).toHaveLength(0);
    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(0);
  });

  it('persiste a mensagem recebida, responde e grava a resposta', async () => {
    const cliente = clienteComLeadIniciado();
    const enviar = vi.fn().mockResolvedValue(undefined);
    const deps = criarDeps(cliente, { enviar });

    const resultado = await processarMensagem(deps, {
      telefone: TELEFONE_INICIADO,
      texto: 'Quero saber mais',
      waMessageId: 'wamid.1',
    });

    expect(resultado.respondeu).toBe(true);
    expect(enviar).toHaveBeenCalledWith(TELEFONE_INICIADO, 'Claro, posso explicar.');
    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(2);
  });

  it('não responde quando o vendedor assumiu a conversa', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_LEADS]: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          telefone: '5511999998888',
          controle_manual: true,
          estagio: 'descoberta',
        },
      ],
      [TABELA_MENSAGENS]: [],
    });
    const enviar = vi.fn();
    const detectar = vi.fn();
    const deps = criarDeps(cliente, { enviar, detector: { detectar } });

    const resultado = await processarMensagem(deps, {
      telefone: '5511999998888',
      texto: 'Oi',
    });

    expect(resultado.respondeu).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
    // A mensagem do lead continua sendo gravada, só não há resposta da IA.
    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(1);
  });

  it('não gasta chamada de IA quando o controle manual está ativo', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_LEADS]: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          telefone: '5511999998888',
          controle_manual: true,
        },
      ],
      [TABELA_MENSAGENS]: [],
    });
    const detectar = vi.fn();
    const deps = criarDeps(cliente, { detector: { detectar } });

    await processarMensagem(deps, { telefone: '5511999998888', texto: 'Oi' });

    expect(detectar).not.toHaveBeenCalled();
  });

  it('ignora reentrega do mesmo webhook sem responder de novo', async () => {
    const cliente = clienteComLeadIniciado();
    const enviar = vi.fn().mockResolvedValue(undefined);
    const deps = criarDeps(cliente, { enviar });
    const entrada = {
      telefone: TELEFONE_INICIADO,
      texto: 'Oi',
      waMessageId: 'wamid.DUPLICADA',
    };

    await processarMensagem(deps, entrada);
    const segunda = await processarMensagem(deps, entrada);

    expect(segunda.respondeu).toBe(false);
    expect(segunda.motivo).toContain('duplicada');
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('encerra e marca opt_out quando o lead pede para parar', async () => {
    const cliente = clienteComLeadIniciado();
    const enviar = vi.fn();
    const deps = criarDeps(cliente, {
      enviar,
      detector: {
        detectar: () => Promise.resolve({ intencao: Intencao.NAO_INTERESSADO, confianca: 0.95 }),
      },
    });

    const resultado = await processarMensagem(deps, {
      telefone: TELEFONE_INICIADO,
      texto: 'Não quero mais receber mensagens',
    });

    expect(resultado.estagio).toBe('encerrado');
    expect(resultado.respondeu).toBe(false);
    expect(enviar).not.toHaveBeenCalled();

    const lead = cliente.linhas(TABELA_LEADS)[0] as unknown as Lead & { opt_out?: boolean };
    expect(lead.opt_out).toBe(true);
  });

  it('persiste o avanço de estágio no lead', async () => {
    const cliente = clienteComLeadIniciado();
    const deps = criarDeps(cliente);

    await processarMensagem(deps, { telefone: TELEFONE_INICIADO, texto: 'Tenho interesse' });

    const lead = cliente.linhas(TABELA_LEADS)[0] as unknown as Lead & { estagio?: string };
    expect(lead.estagio).toBe('descoberta');
  });

  it('encaminha para handoff quando o score cruza o limiar', async () => {
    const cliente = clienteComLeadIniciado();
    const enviar = vi.fn();
    const deps = criarDeps(cliente, { enviar });

    const resultado = await processarMensagem(
      deps,
      { telefone: TELEFONE_INICIADO, texto: 'Quero fechar', score: 85 },
      { limiarHandoff: 70 },
    );

    expect(resultado.estagio).toBe('handoff');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('não perde a mensagem do lead quando a geração de resposta falha', async () => {
    const cliente = clienteComLeadIniciado();
    const deps = criarDeps(cliente, {
      gerador: { gerar: () => Promise.reject(new Error('IA indisponível')) },
    });

    await expect(
      processarMensagem(deps, { telefone: TELEFONE_INICIADO, texto: 'Oi' }),
    ).rejects.toThrow('IA indisponível');

    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(1);
  });

  it('usa a abordagem sugerida quando informada', async () => {
    const cliente = clienteComLeadIniciado();
    const gerar = vi
      .fn()
      .mockResolvedValue({ resposta: 'Resposta pronta', origem: 'abordagem' as const });
    const deps = criarDeps(cliente, { gerador: { gerar } });

    const resultado = await processarMensagem(deps, {
      telefone: TELEFONE_INICIADO,
      texto: 'Está caro',
      abordagem: { texto: 'Resposta pronta', confianca: 0.8 },
    });

    expect(resultado.origemResposta).toBe('abordagem');
    expect(gerar).toHaveBeenCalledWith(
      expect.objectContaining({ abordagem: { texto: 'Resposta pronta', confianca: 0.8 } }),
    );
  });
});
