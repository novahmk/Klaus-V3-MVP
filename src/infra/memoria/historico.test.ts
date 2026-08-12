import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from '../persistencia/cliente-memoria.js';
import { TABELA_LEADS, TABELA_MENSAGENS } from '../persistencia/constants.js';
import { registrarMensagem } from '../persistencia/mensagens.js';
import type { PersistenciaDependencies } from '../persistencia/index.js';
import {
  carregarHistorico,
  contarMensagensDoLead,
  horasDesdeUltimaMensagemDoLead,
} from './historico.js';
import type { MensagemHistorico } from './historico.js';

function criarDeps(cliente: ClienteMemoria, agora?: () => Date): PersistenciaDependencies {
  return {
    cliente,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
    ...(agora === undefined ? {} : { agora }),
  };
}

describe('carregarHistorico', () => {
  it('traduz direcao do banco para os papéis usados pelos componentes de IA', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });
    let minuto = 0;
    const deps = criarDeps(cliente, () => {
      minuto += 1;
      return new Date(`2026-08-12T14:0${minuto}:00.000Z`);
    });

    const { lead } = await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Oi',
    });
    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'saida',
      conteudo: 'Olá, tudo bem?',
    });

    const historico = await carregarHistorico(criarDeps(cliente), lead.id);

    expect(historico).toEqual([
      { role: 'lead', conteudo: 'Oi', timestamp: new Date('2026-08-12T14:01:00.000Z') },
      {
        role: 'klaus',
        conteudo: 'Olá, tudo bem?',
        timestamp: new Date('2026-08-12T14:02:00.000Z'),
      },
    ]);
  });

  it('mantém apenas as mensagens mais recentes ao aplicar o limite', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });
    let minuto = 0;
    const deps = criarDeps(cliente, () => {
      minuto += 1;
      return new Date(`2026-08-12T14:${String(minuto).padStart(2, '0')}:00.000Z`);
    });

    const { lead } = await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Primeira',
    });
    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Segunda',
    });
    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Terceira',
    });

    const historico = await carregarHistorico(criarDeps(cliente), lead.id, { limite: 2 });

    expect(historico.map((mensagem) => mensagem.conteudo)).toEqual(['Segunda', 'Terceira']);
  });

  it('não mistura histórico de leads diferentes', async () => {
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

    const historico = await carregarHistorico(deps, lead.id);

    expect(historico).toHaveLength(1);
    expect(historico[0]?.conteudo).toBe('Do lead A');
  });

  it('retorna vazio para lead sem mensagens', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });

    await expect(
      carregarHistorico(criarDeps(cliente), '11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual([]);
  });
});

describe('contarMensagensDoLead', () => {
  it('conta apenas as mensagens do lead', () => {
    const historico: MensagemHistorico[] = [
      { role: 'lead', conteudo: 'a', timestamp: new Date() },
      { role: 'klaus', conteudo: 'b', timestamp: new Date() },
      { role: 'lead', conteudo: 'c', timestamp: new Date() },
    ];

    expect(contarMensagensDoLead(historico)).toBe(2);
  });
});

describe('horasDesdeUltimaMensagemDoLead', () => {
  it('calcula o tempo desde a última mensagem do lead', () => {
    const historico: MensagemHistorico[] = [
      { role: 'lead', conteudo: 'a', timestamp: new Date('2026-08-12T10:00:00.000Z') },
      { role: 'klaus', conteudo: 'b', timestamp: new Date('2026-08-12T15:00:00.000Z') },
    ];

    const horas = horasDesdeUltimaMensagemDoLead(historico, new Date('2026-08-12T16:00:00.000Z'));

    expect(horas).toBe(6);
  });

  it('ignora mensagens do Klaus no cálculo', () => {
    const historico: MensagemHistorico[] = [
      { role: 'klaus', conteudo: 'b', timestamp: new Date('2026-08-12T15:00:00.000Z') },
    ];

    expect(horasDesdeUltimaMensagemDoLead(historico, new Date())).toBeNull();
  });
});
