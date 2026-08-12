import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from './cliente-memoria.js';
import { TABELA_LEADS, TABELA_MENSAGENS } from './constants.js';
import { ConflitoUnicoError } from './errors.js';
import { registrarMensagem } from './mensagens.js';
import type { PersistenciaDependencies } from './types.js';

function criarDeps(cliente: ClienteMemoria): PersistenciaDependencies {
  return {
    cliente,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
  };
}

function clienteVazio(): ClienteMemoria {
  return new ClienteMemoria({ [TABELA_LEADS]: [], [TABELA_MENSAGENS]: [] });
}

describe('idempotência por wa_message_id', () => {
  it('reentrega do mesmo webhook não duplica a mensagem', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);
    const entrada = {
      telefone: '5511999998888',
      direcao: 'entrada' as const,
      conteudo: 'Oi',
      waMessageId: 'wamid.ABC123',
    };

    const primeira = await registrarMensagem(deps, entrada);
    const segunda = await registrarMensagem(deps, entrada);

    expect(primeira.duplicada).toBe(false);
    expect(segunda.duplicada).toBe(true);
    expect(segunda.mensagem.id).toBe(primeira.mensagem.id);
    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(1);
  });

  it('mensagens distintas do mesmo lead são persistidas normalmente', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Primeira',
      waMessageId: 'wamid.AAA',
    });
    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Segunda',
      waMessageId: 'wamid.BBB',
    });

    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(2);
  });

  it('sem waMessageId não há deduplicação', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'saida',
      conteudo: 'Mensagem do Klaus',
    });
    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'saida',
      conteudo: 'Mensagem do Klaus',
    });

    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(2);
  });

  it('resolve a corrida entre duas reentregas simultâneas', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Oi',
      waMessageId: 'wamid.RACE',
    });

    // A verificação prévia não enxergou a linha, mas o índice único pegou.
    let chamadas = 0;

    cliente.selecionarUm = ((tabela: string, filtros: Record<string, string>) => {
      if (tabela === TABELA_MENSAGENS && filtros['wa_message_id'] === 'wamid.RACE') {
        const encontrada = cliente
          .linhas(TABELA_MENSAGENS)
          .find((linha) => linha['wa_message_id'] === 'wamid.RACE');

        return Promise.resolve(chamadas++ === 0 ? null : encontrada);
      }

      return Promise.resolve(
        cliente.linhas(tabela).find((linha) =>
          Object.entries(filtros).every(([coluna, valor]) => linha[coluna] === valor),
        ) ?? null,
      );
    }) as typeof cliente.selecionarUm;

    const resultado = await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Oi',
      waMessageId: 'wamid.RACE',
    });

    expect(resultado.duplicada).toBe(true);
    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(1);
  });

  it('propaga conflito que não é de wa_message_id', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarMensagem(deps, {
      telefone: '5511999998888',
      direcao: 'entrada',
      conteudo: 'Primeira',
    });

    cliente.inserirUm = () =>
      Promise.reject(new ConflitoUnicoError(TABELA_MENSAGENS, 'outra_restricao'));

    await expect(
      registrarMensagem(deps, {
        telefone: '5511999998888',
        direcao: 'entrada',
        conteudo: 'Segunda',
      }),
    ).rejects.toThrow(/Falha ao inserir mensagem/);
  });
});
