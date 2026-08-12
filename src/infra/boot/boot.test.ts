import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from '../persistencia/cliente-memoria.js';
import { CONTRATO_SCHEMA } from '../database/schema-contrato.js';
import type { ColunaReal, LeitorSchema } from '../database/verificar-schema.js';
import { BootError, iniciar, verificarSaude } from './boot.js';

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

const ambienteValido = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key-suficientemente-longa',
  INTERNAL_API_KEY: 'chave-interna-longa-o-bastante',
  OPENAI_API_KEY: 'sk-teste',
  WASENDER_API_KEY: 'wasender-teste',
  WASENDER_WEBHOOK_SECRET: 'segredo-webhook-longo-o-bastante',
};

describe('verificarSaude', () => {
  it('reporta tudo ok quando banco e schema estão corretos', async () => {
    const saude = await verificarSaude({
      cliente: new ClienteMemoria({ leads: [] }),
      leitorSchema: leitorValido(),
    });

    expect(saude.saudavel).toBe(true);
    expect(saude.itens.map((item) => item.estado)).toEqual(['ok', 'ok']);
  });

  it('acusa falha quando o schema diverge, mesmo com o banco acessível', async () => {
    const leitorComDrift: LeitorSchema = {
      listarColunas: () =>
        Promise.resolve(colunasDoContrato().filter((coluna) => coluna.table_name !== 'mensagens')),
    };

    const saude = await verificarSaude({
      cliente: new ClienteMemoria({ leads: [] }),
      leitorSchema: leitorComDrift,
    });

    expect(saude.saudavel).toBe(false);
    expect(saude.itens.find((item) => item.nome === 'schema')?.estado).toBe('falha');
    expect(saude.itens.find((item) => item.nome === 'supabase')?.estado).toBe('ok');
  });

  it('acusa falha de banco sem derrubar o health check', async () => {
    const clienteQuebrado = new ClienteMemoria({ leads: [] });
    clienteQuebrado.selecionarUm = () => Promise.reject(new Error('conexão recusada'));

    const saude = await verificarSaude({
      cliente: clienteQuebrado,
      leitorSchema: leitorValido(),
    });

    expect(saude.saudavel).toBe(false);
    expect(saude.itens.find((item) => item.nome === 'supabase')?.detalhe).toContain(
      'conexão recusada',
    );
  });
});

describe('iniciar', () => {
  it('sobe quando ambiente e schema estão válidos', async () => {
    const ambiente = await iniciar(
      { cliente: new ClienteMemoria(), leitorSchema: leitorValido() },
      ambienteValido,
    );

    expect(ambiente.supabaseUrl).toBe('https://projeto.supabase.co');
  });

  it('falha antes de conectar quando falta variável de ambiente', async () => {
    await expect(
      iniciar({ cliente: new ClienteMemoria(), leitorSchema: leitorValido() }, {}),
    ).rejects.toThrow(/Ambiente inválido/);
  });

  it('recusa subir com schema divergente', async () => {
    const leitorVazio: LeitorSchema = { listarColunas: () => Promise.resolve([]) };

    await expect(
      iniciar({ cliente: new ClienteMemoria(), leitorSchema: leitorVazio }, ambienteValido),
    ).rejects.toBeInstanceOf(BootError);
  });
});
