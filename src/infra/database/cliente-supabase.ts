import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ConflitoUnicoError } from '../persistencia/errors.js';
import type { ClienteSupabase, OpcoesConsulta, ValorFiltro } from '../persistencia/types.js';
import type { ColunaReal, LeitorSchema } from './verificar-schema.js';

/** Código Postgres para violação de índice único. */
const CODIGO_UNIQUE_VIOLATION = '23505';

interface ErroSupabase {
  code?: string;
  message: string;
  details?: string;
}

function ehConflitoUnico(erro: ErroSupabase): boolean {
  return erro.code === CODIGO_UNIQUE_VIOLATION;
}

function traduzirErro(tabela: string, erro: ErroSupabase): Error {
  if (ehConflitoUnico(erro)) {
    return new ConflitoUnicoError(tabela, erro.details ?? erro.message, { cause: erro });
  }

  return new Error(`[${erro.code ?? 'sem-codigo'}] ${erro.message}`);
}

/**
 * Adapter real da porta `ClienteSupabase`. Toda a lógica de domínio permanece
 * agnóstica: aqui só traduzimos chamadas e normalizamos erros do Postgres.
 */
export class ClienteSupabaseAdapter implements ClienteSupabase {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  static criar(url: string, serviceKey: string): ClienteSupabaseAdapter {
    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    return new ClienteSupabaseAdapter(client);
  }

  async selecionarUm<T>(tabela: string, filtros: Record<string, ValorFiltro>): Promise<T | null> {
    const { data, error } = await this.client
      .from(tabela)
      .select('*')
      .match(filtros)
      .limit(1)
      .maybeSingle();

    if (error !== null) {
      throw traduzirErro(tabela, error);
    }

    return (data as T | null) ?? null;
  }

  async selecionarTodos<T>(
    tabela: string,
    filtros: Record<string, ValorFiltro>,
    opcoes?: OpcoesConsulta,
  ): Promise<T[]> {
    let consulta = this.client.from(tabela).select('*').match(filtros);

    if (opcoes?.ordenacao !== undefined) {
      consulta = consulta.order(opcoes.ordenacao.coluna, {
        ascending: opcoes.ordenacao.ascendente,
      });
    }

    if (opcoes?.limite !== undefined) {
      const inicio = opcoes.deslocamento ?? 0;

      consulta = consulta.range(inicio, inicio + opcoes.limite - 1);
    }

    const { data, error } = await consulta;

    if (error !== null) {
      throw traduzirErro(tabela, error);
    }

    return (data as T[] | null) ?? [];
  }

  async contar(tabela: string, filtros: Record<string, ValorFiltro>): Promise<number> {
    const { count, error } = await this.client
      .from(tabela)
      .select('*', { count: 'exact', head: true })
      .match(filtros);

    if (error !== null) {
      throw traduzirErro(tabela, error);
    }

    return count ?? 0;
  }

  async inserirUm<T>(tabela: string, valores: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.from(tabela).insert(valores).select().single();

    if (error !== null) {
      throw traduzirErro(tabela, error);
    }

    return data as T;
  }

  async atualizarPorId(
    tabela: string,
    id: string,
    valores: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.client.from(tabela).update(valores).eq('id', id);

    if (error !== null) {
      throw traduzirErro(tabela, error);
    }
  }

  async excluir(tabela: string, filtros: Record<string, ValorFiltro>): Promise<number> {
    // Sem filtro, o PostgREST apagaria a tabela inteira.
    if (Object.keys(filtros).length === 0) {
      throw new Error(`Exclusão sem filtro não é permitida (tabela ${tabela}).`);
    }

    const { data, error } = await this.client.from(tabela).delete().match(filtros).select('id');

    if (error !== null) {
      throw traduzirErro(tabela, error);
    }

    return (data as unknown[] | null)?.length ?? 0;
  }
}

/** Lê os metadados de colunas via RPC (ver migration 0002). */
export class LeitorSchemaSupabase implements LeitorSchema {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async listarColunas(tabelas: string[]): Promise<ColunaReal[]> {
    const { data, error } = await this.client.rpc('klaus_listar_colunas', { tabelas });

    if (error !== null) {
      throw new Error(`Falha ao ler o schema do banco: ${error.message}`);
    }

    return (data as ColunaReal[] | null) ?? [];
  }
}

/** Cria as duas portas compartilhando uma única conexão. */
export function criarClientes(
  url: string,
  serviceKey: string,
): {
  client: SupabaseClient;
  cliente: ClienteSupabaseAdapter;
  leitorSchema: LeitorSchemaSupabase;
} {
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    client,
    cliente: new ClienteSupabaseAdapter(client),
    leitorSchema: new LeitorSchemaSupabase(client),
  };
}
