import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from './cliente-memoria.js';
import { TABELA_LEADS } from './constants.js';
import { ValidacaoPersistenciaError } from './errors.js';
import {
  buscarLeadPorTelefone,
  definirControleManual,
  estaSobControleManual,
  resolverLead,
} from './leads.js';
import type { Lead, PersistenciaDependencies } from './types.js';

const loggerSilencioso = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

function criarDeps(cliente: ClienteMemoria): PersistenciaDependencies {
  return { cliente, logger: loggerSilencioso };
}

describe('buscarLeadPorTelefone', () => {
  it('localiza o lead pelo telefone normalizado', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_LEADS]: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          telefone: '5511999998888',
          nome: 'Ana',
          controle_manual: false,
        },
      ],
    });

    const lead = await buscarLeadPorTelefone(criarDeps(cliente), '+55 (11) 99999-8888');

    expect(lead?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(lead?.nome).toBe('Ana');
  });

  it('retorna null quando não existe lead para o telefone', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });

    await expect(buscarLeadPorTelefone(criarDeps(cliente), '5511999998888')).resolves.toBeNull();
  });

  it('rejeita telefone inválido em vez de consultar o banco', async () => {
    const cliente = new ClienteMemoria();

    await expect(buscarLeadPorTelefone(criarDeps(cliente), '123')).rejects.toBeInstanceOf(
      ValidacaoPersistenciaError,
    );
  });
});

describe('resolverLead', () => {
  it('cria o lead quando ele ainda não existe', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });

    const lead = await resolverLead(criarDeps(cliente), '(11) 99999-8888 ', 'Bruno');

    expect(lead.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(lead.telefone).toBe('11999998888');
    expect(cliente.linhas(TABELA_LEADS)).toHaveLength(1);
  });

  it('não duplica lead em chamadas repetidas', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });
    const deps = criarDeps(cliente);

    const primeiro = await resolverLead(deps, '5511999998888');
    const segundo = await resolverLead(deps, '5511999998888');

    expect(segundo.id).toBe(primeiro.id);
    expect(cliente.linhas(TABELA_LEADS)).toHaveLength(1);
  });

  it('cria o lead com controle_manual desligado', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });

    const lead = await resolverLead(criarDeps(cliente), '5511999998888');

    expect(lead.controle_manual).toBe(false);
  });
});

describe('estaSobControleManual', () => {
  it('retorna true quando o vendedor assumiu a conversa', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_LEADS]: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          telefone: '5511999998888',
          controle_manual: true,
        },
      ],
    });

    await expect(estaSobControleManual(criarDeps(cliente), '5511999998888')).resolves.toBe(true);
  });

  it('retorna false para lead inexistente', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });

    await expect(estaSobControleManual(criarDeps(cliente), '5511999998888')).resolves.toBe(false);
  });
});

describe('definirControleManual', () => {
  it('persiste a pausa da IA no banco', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });
    const deps = criarDeps(cliente);

    const lead = await definirControleManual(deps, '5511999998888', true);

    expect(lead.controle_manual).toBe(true);
    await expect(estaSobControleManual(deps, '5511999998888')).resolves.toBe(true);

    const persistido = cliente.linhas(TABELA_LEADS)[0] as unknown as Lead;
    expect(persistido.controle_manual).toBe(true);
  });

  it('devolve o controle à IA', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });
    const deps = criarDeps(cliente);

    await definirControleManual(deps, '5511999998888', true);
    await definirControleManual(deps, '5511999998888', false);

    await expect(estaSobControleManual(deps, '5511999998888')).resolves.toBe(false);
  });
});
