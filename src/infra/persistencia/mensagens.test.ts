import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from './cliente-memoria.js';
import { TABELA_LEADS, TABELA_MENSAGENS } from './constants.js';
import { PersistenciaError, ValidacaoPersistenciaError } from './errors.js';
import { listarMensagensDoLead, registrarMensagem } from './mensagens.js';
import type { Lead, MensagemPersistida, PersistenciaDependencies } from './types.js';

const loggerSilencioso = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

function criarDeps(cliente: ClienteMemoria, agora?: () => Date): PersistenciaDependencies {
  return { cliente, logger: loggerSilencioso, ...(agora === undefined ? {} : { agora }) };
}

describe('registrarMensagem', () => {
  it('grava lead_id como UUID válido de leads(id)', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });

    const { lead, mensagem } = await registrarMensagem(criarDeps(cliente), {
      telefone: '+55 11 99999-8888',
      direcao: 'entrada',
      conteudo: 'Oi, quero saber o preço',
    });

    expect(mensagem.lead_id).toBe(lead.id);
    expect(mensagem.lead_id).not.toBe('5511999998888');
    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(1);
  });

  it('cria o lead automaticamente na primeira mensagem recebida', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });

    await registrarMensagem(criarDeps(cliente), {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Olá',
      nome: 'Carla',
    });

    const leads = cliente.linhas(TABELA_LEADS) as unknown as Lead[];
    expect(leads).toHaveLength(1);
    expect(leads[0]?.nome).toBe('Carla');
  });

  it('reaproveita o lead existente em vez de duplicar', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });
    const deps = criarDeps(cliente);

    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Primeira',
    });
    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'saida',
      conteudo: 'Segunda',
    });

    expect(cliente.linhas(TABELA_LEADS)).toHaveLength(1);
    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(2);
  });

  it('atualiza ultima_mensagem e ultima_interacao do lead', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });
    const instante = new Date('2026-08-12T14:30:00.000Z');

    await registrarMensagem(criarDeps(cliente, () => instante), {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Tudo bem?',
    });

    const lead = cliente.linhas(TABELA_LEADS)[0] as unknown as Lead;
    expect(lead.ultima_mensagem).toBe('Tudo bem?');
    expect(lead.ultima_interacao).toBe(instante.toISOString());
  });

  it('propaga falha do banco em vez de engolir o erro', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_LEADS]: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          telefone: '5511999998888',
          controle_manual: false,
        },
      ],
      [TABELA_MENSAGENS]: [],
    });
    const deps = criarDeps(cliente);

    cliente.inserirUm = () => Promise.reject(new Error('violates foreign key constraint'));

    await expect(
      registrarMensagem(deps, {
        telefone: '5511999998888',
        direcao: 'entrada',
        conteudo: 'Mensagem',
      }),
    ).rejects.toBeInstanceOf(PersistenciaError);
  });

  it('rejeita conteúdo vazio', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });

    await expect(
      registrarMensagem(criarDeps(cliente), {
        telefone: '5511999998888',
        direcao: 'entrada',
        conteudo: '   ',
      }),
    ).rejects.toBeInstanceOf(ValidacaoPersistenciaError);
  });
});

describe('listarMensagensDoLead', () => {
  it('retorna a conversa em ordem cronológica', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });
    const deps = criarDeps(cliente);
    let minuto = 0;

    const proximoInstante = (): Date => {
      minuto += 1;
      return new Date(`2026-08-12T14:0${minuto}:00.000Z`);
    };

    const depsComRelogio = criarDeps(cliente, proximoInstante);

    const { lead } = await registrarMensagem(depsComRelogio, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Primeira',
    });
    await registrarMensagem(depsComRelogio, {
      telefone: '5511999998888',
      direcao: 'saida',
      conteudo: 'Segunda',
    });

    const mensagens: MensagemPersistida[] = await listarMensagensDoLead(deps, lead.id);

    expect(mensagens.map((item) => item.conteudo)).toEqual(['Primeira', 'Segunda']);
  });

  it('não retorna mensagens de outro lead', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });
    const deps = criarDeps(cliente);

    const { lead } = await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Do lead A',
    });
    await registrarMensagem(deps, {
      telefone: '5511777776666',
      direcao: 'entrada',
      conteudo: 'Do lead B',
    });

    const mensagens = await listarMensagensDoLead(deps, lead.id);

    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]?.conteudo).toBe('Do lead A');
  });
});
