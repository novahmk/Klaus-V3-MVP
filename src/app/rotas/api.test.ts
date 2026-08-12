import { describe, expect, it } from 'vitest';

import { ProvedorConfiguracaoSupabase, TABELA_CONFIG_IA } from '../adaptadores/configuracao.js';
import { CONTRATO_SCHEMA } from '../../infra/database/schema-contrato.js';
import type { ColunaReal, LeitorSchema } from '../../infra/database/verificar-schema.js';
import { ClienteMemoria } from '../../infra/persistencia/cliente-memoria.js';
import {
  TABELA_LEADS,
  TABELA_MENSAGENS,
  TABELA_REGRAS_CONVERSA,
} from '../../infra/persistencia/constants.js';
import { criarServidor } from '../servidor.js';
import { HEADER_CHAVE_INTERNA } from './api.js';

const CHAVE = 'chave-interna-de-teste-longa';
const LEAD_ID = '11111111-1111-4111-8111-111111111111';

function leitorValido(): LeitorSchema {
  const colunas: ColunaReal[] = CONTRATO_SCHEMA.flatMap((tabela) =>
    tabela.colunas.map((coluna) => ({
      table_name: tabela.nome,
      column_name: coluna.nome,
      data_type: coluna.tipo,
      is_nullable: coluna.nulabilidade === 'obrigatoria' ? ('NO' as const) : ('YES' as const),
    })),
  );

  return { listarColunas: () => Promise.resolve(colunas) };
}

function criarApp() {
  const cliente = new ClienteMemoria({
    [TABELA_LEADS]: [
      {
        id: LEAD_ID,
        telefone: '5511999998888',
        nome: 'Ana',
        controle_manual: false,
        estagio: 'descoberta',
        ultima_interacao: '2026-08-12T10:00:00.000Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        telefone: '5511777776666',
        nome: 'Bruno',
        controle_manual: false,
        estagio: 'abertura',
        ultima_interacao: '2026-08-11T10:00:00.000Z',
      },
    ],
    [TABELA_MENSAGENS]: [
      {
        id: 'm1',
        lead_id: LEAD_ID,
        direcao: 'entrada',
        conteudo: 'Olá',
        criado_em: '2026-08-12T10:00:00.000Z',
      },
    ],
    [TABELA_CONFIG_IA]: [{ id: '1', persona: 'SDR', objetivo: 'Agendar demo' }],
    [TABELA_REGRAS_CONVERSA]: [],
  });

  const app = criarServidor({
    cliente,
    leitorSchema: leitorValido(),
    api: {
      chaveInterna: CHAVE,
      persistencia: { cliente },
      configuracao: new ProvedorConfiguracaoSupabase({ cliente }),
    },
  });

  return { app, cliente };
}

const auth = { [HEADER_CHAVE_INTERNA]: CHAVE };

describe('autenticação da API', () => {
  it('recusa requisição sem chave interna', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({ method: 'GET', url: '/api/leads' });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it('recusa chave errada', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/leads',
      headers: { [HEADER_CHAVE_INTERNA]: 'chave-errada-do-mesmo-tamanho' },
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it('não exige chave no health', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);

    await app.close();
  });
});

describe('GET /api/leads', () => {
  it('lista leads com total e paginação', async () => {
    const { app } = criarApp();

    const corpo = (await app.inject({ method: 'GET', url: '/api/leads', headers: auth })).json();

    expect(corpo.total).toBe(2);
    expect(corpo.leads).toHaveLength(2);
    expect(corpo.pagina).toBe(1);

    await app.close();
  });

  it('ordena do mais recente para o mais antigo', async () => {
    const { app } = criarApp();

    const corpo = (await app.inject({ method: 'GET', url: '/api/leads', headers: auth })).json();

    expect(corpo.leads[0].nome).toBe('Ana');

    await app.close();
  });

  it('filtra por estágio para o Kanban', async () => {
    const { app } = criarApp();

    const corpo = (
      await app.inject({ method: 'GET', url: '/api/leads?estagio=abertura', headers: auth })
    ).json();

    expect(corpo.leads).toHaveLength(1);
    expect(corpo.leads[0].nome).toBe('Bruno');

    await app.close();
  });

  it('respeita o limite informado', async () => {
    const { app } = criarApp();

    const corpo = (
      await app.inject({ method: 'GET', url: '/api/leads?limite=1', headers: auth })
    ).json();

    expect(corpo.leads).toHaveLength(1);
    expect(corpo.total).toBe(2);

    await app.close();
  });

  it('recusa limite acima do máximo permitido', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/leads?limite=5000',
      headers: auth,
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});

describe('GET /api/leads/:id/mensagens', () => {
  it('devolve a conversa do lead', async () => {
    const { app } = criarApp();

    const corpo = (
      await app.inject({ method: 'GET', url: `/api/leads/${LEAD_ID}/mensagens`, headers: auth })
    ).json();

    expect(corpo.mensagens).toHaveLength(1);
    expect(corpo.mensagens[0].conteudo).toBe('Olá');

    await app.close();
  });

  it('responde 404 para lead inexistente', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/leads/33333333-3333-4333-8333-333333333333/mensagens',
      headers: auth,
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it('recusa id que não é uuid', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/leads/abc/mensagens',
      headers: auth,
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});

describe('POST /api/leads/:id/controle-manual', () => {
  it('pausa a IA e persiste no banco', async () => {
    const { app, cliente } = criarApp();

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/leads/${LEAD_ID}/controle-manual`,
      headers: auth,
      payload: { ativo: true },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().controle_manual).toBe(true);
    expect(cliente.linhas(TABELA_LEADS)[0]?.['controle_manual']).toBe(true);

    await app.close();
  });

  it('devolve o controle à IA', async () => {
    const { app, cliente } = criarApp();

    await app.inject({
      method: 'POST',
      url: `/api/leads/${LEAD_ID}/controle-manual`,
      headers: auth,
      payload: { ativo: false },
    });

    expect(cliente.linhas(TABELA_LEADS)[0]?.['controle_manual']).toBe(false);

    await app.close();
  });

  it('recusa corpo sem o campo ativo', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/leads/${LEAD_ID}/controle-manual`,
      headers: auth,
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});

describe('config da IA', () => {
  it('devolve persona, objetivo e regras', async () => {
    const { app } = criarApp();

    const corpo = (await app.inject({ method: 'GET', url: '/api/config', headers: auth })).json();

    expect(corpo.agente.persona).toBe('SDR');
    expect(corpo.regras).toBeDefined();

    await app.close();
  });

  it('salva a edição e reflete imediatamente, sem esperar o TTL', async () => {
    const { app } = criarApp();

    await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: auth,
      payload: { persona: 'SDR consultivo' },
    });

    const corpo = (await app.inject({ method: 'GET', url: '/api/config', headers: auth })).json();

    expect(corpo.agente.persona).toBe('SDR consultivo');

    await app.close();
  });

  it('recusa campo desconhecido', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: auth,
      payload: { campoInventado: 'x' },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it('recusa persona vazia', async () => {
    const { app } = criarApp();

    const resposta = await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: auth,
      payload: { persona: '' },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});
