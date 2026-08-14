import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CONTRATO_SCHEMA } from '../infra/database/schema-contrato.js';
import type { ColunaReal, LeitorSchema } from '../infra/database/verificar-schema.js';
import { ClienteMemoria } from '../infra/persistencia/cliente-memoria.js';
import { criarServidor } from './servidor.js';

function colunasDoContrato(): ColunaReal[] {
  return CONTRATO_SCHEMA.flatMap((tabela) =>
    tabela.colunas.map((coluna) => ({
      table_name: tabela.nome,
      column_name: coluna.nome,
      data_type: coluna.tipo,
      is_nullable: coluna.nulabilidade === 'obrigatoria' ? ('NO' as const) : ('YES' as const),
    })),
  );
}

function leitorValido(): LeitorSchema {
  return { listarColunas: () => Promise.resolve(colunasDoContrato()) };
}

function servidorSaudavel() {
  return criarServidor({
    cliente: new ClienteMemoria({ leads: [] }),
    leitorSchema: leitorValido(),
  });
}

describe('GET /', () => {
  it('responde 200 como liveness', async () => {
    const app = servidorSaudavel();

    const resposta = await app.inject({ method: 'GET', url: '/' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ servico: 'klaus-backend' });

    await app.close();
  });

  it('responde 200 mesmo com o banco fora, para não entrar em crash-loop', async () => {
    const clienteQuebrado = new ClienteMemoria({ leads: [] });
    clienteQuebrado.selecionarUm = () => Promise.reject(new Error('sem conexão'));

    const app = criarServidor({ cliente: clienteQuebrado, leitorSchema: leitorValido() });

    const resposta = await app.inject({ method: 'GET', url: '/' });

    expect(resposta.statusCode).toBe(200);

    await app.close();
  });
});

describe('GET /health', () => {
  it('responde 200 quando banco e schema estão ok', async () => {
    const app = servidorSaudavel();

    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ saudavel: true });

    await app.close();
  });

  it('responde 503 quando o schema diverge do contrato', async () => {
    const leitorComDrift: LeitorSchema = {
      listarColunas: () =>
        Promise.resolve(colunasDoContrato().filter((coluna) => coluna.table_name !== 'mensagens')),
    };
    const app = criarServidor({
      cliente: new ClienteMemoria({ leads: [] }),
      leitorSchema: leitorComDrift,
    });

    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json().saudavel).toBe(false);

    await app.close();
  });

  it('não fica pendurado quando o banco não responde', async () => {
    const clienteLento = new ClienteMemoria({ leads: [] });
    clienteLento.selecionarUm = () => new Promise(() => undefined);

    const app = criarServidor({
      cliente: clienteLento,
      leitorSchema: leitorValido(),
      timeoutMs: 50,
    });

    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json().itens[0].detalhe).toContain('excedeu');

    await app.close();
  });

  it('separa a falha por dependência', async () => {
    const clienteQuebrado = new ClienteMemoria({ leads: [] });
    clienteQuebrado.selecionarUm = () => Promise.reject(new Error('sem conexão'));

    const app = criarServidor({ cliente: clienteQuebrado, leitorSchema: leitorValido() });

    const corpo = (await app.inject({ method: 'GET', url: '/health' })).json();

    expect(corpo.itens.find((item: { nome: string }) => item.nome === 'supabase').estado).toBe(
      'falha',
    );
    expect(corpo.itens.find((item: { nome: string }) => item.nome === 'schema').estado).toBe('ok');

    await app.close();
  });
});

describe('rota inexistente', () => {
  it('responde 404 com mensagem clara', async () => {
    const app = servidorSaudavel();

    const resposta = await app.inject({ method: 'GET', url: '/nao-existe' });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });

  it('serve o dashboard na raiz e faz fallback SPA quando o build existe', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'dashboard-'));
    writeFileSync(join(raiz, 'index.html'), '<!doctype html><title>Klaus AI</title>');

    const app = criarServidor({
      cliente: new ClienteMemoria({ leads: [] }),
      leitorSchema: leitorValido(),
      dashboard: { raiz },
    });

    const raizResposta = await app.inject({ method: 'GET', url: '/' });
    expect(raizResposta.statusCode).toBe(200);
    expect(raizResposta.body).toContain('Klaus AI');

    // Rota client-side desconhecida do Fastify volta o index.html.
    const spa = await app.inject({ method: 'GET', url: '/kanban' });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('Klaus AI');

    // /api continua 404 JSON, nunca HTML.
    const api = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toMatchObject({ erro: expect.stringContaining('/api/nao-existe') });

    await app.close();
  });
});
