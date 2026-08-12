import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from './cliente-memoria.js';
import { TABELA_LEADS } from './constants.js';
import { ConflitoUnicoError } from './errors.js';
import { resolverLead } from './leads.js';
import type { PersistenciaDependencies } from './types.js';

const loggerSilencioso = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

function criarDeps(cliente: ClienteMemoria): PersistenciaDependencies {
  return { cliente, logger: loggerSilencioso };
}

describe('unicidade de leads', () => {
  it('o índice único impede dois leads com o mesmo telefone', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });

    await cliente.inserirUm(TABELA_LEADS, { telefone: '5511999998888', controle_manual: false });

    await expect(
      cliente.inserirUm(TABELA_LEADS, { telefone: '5511999998888', controle_manual: false }),
    ).rejects.toBeInstanceOf(ConflitoUnicoError);
  });

  it('reaproveita o lead criado por um webhook concorrente em vez de falhar', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });

    // Outro webhook do mesmo número venceu a corrida e já criou o lead.
    await cliente.inserirUm(TABELA_LEADS, {
      telefone: '5511999998888',
      nome: null,
      controle_manual: false,
    });

    // Simula a leitura que aconteceu ANTES do concorrente inserir.
    const buscaOriginal = cliente.selecionarUm.bind(cliente);
    let primeiraBusca = true;

    cliente.selecionarUm = ((tabela: string, filtros: Record<string, string>) => {
      if (primeiraBusca) {
        primeiraBusca = false;
        return Promise.resolve(null);
      }

      return buscaOriginal(tabela, filtros);
    }) as typeof cliente.selecionarUm;

    const lead = await resolverLead(criarDeps(cliente), '5511999998888');

    expect(lead.telefone).toBe('5511999998888');
    expect(cliente.linhas(TABELA_LEADS)).toHaveLength(1);
  });

  it('propaga o conflito quando o lead concorrente não pode ser lido', async () => {
    const cliente = new ClienteMemoria({ [TABELA_LEADS]: [] });

    cliente.selecionarUm = () => Promise.resolve(null);
    cliente.inserirUm = () =>
      Promise.reject(new ConflitoUnicoError(TABELA_LEADS, 'leads_telefone_unico'));

    await expect(resolverLead(criarDeps(cliente), '5511999998888')).rejects.toThrow(
      /Falha ao criar lead/,
    );
  });
});
