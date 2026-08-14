import type { SupabaseClient } from '@supabase/supabase-js';

import { carregarAmbiente } from '../config/ambiente.js';
import type { Ambiente } from '../config/ambiente.js';
import { garantirSchema } from '../database/verificar-schema.js';
import type { LeitorSchema } from '../database/verificar-schema.js';
import type { ClienteSupabase } from '../persistencia/index.js';
import { comTimeout } from '../resiliencia/timeout.js';
import { validarSchemaSupabase } from './supabase-schema.js';

/** Nenhuma verificação de saúde pode demorar mais que isso. */
export const TIMEOUT_SAUDE_MS = 3000;

export type EstadoDependencia = 'ok' | 'falha';

export interface ItemSaude {
  nome: string;
  estado: EstadoDependencia;
  detalhe?: string;
}

export interface Saude {
  saudavel: boolean;
  itens: ItemSaude[];
  verificadoEm: string;
}

export interface DependenciasBoot {
  cliente: ClienteSupabase;
  leitorSchema: LeitorSchema;
  /** Cliente bruto do Supabase, usado para validar o schema via `information_schema`. */
  client?: SupabaseClient;
  agora?: () => Date;
  timeoutMs?: number;
}

async function verificar(
  nome: string,
  acao: () => Promise<unknown>,
  timeoutMs: number,
): Promise<ItemSaude> {
  try {
    await comTimeout(acao(), timeoutMs, `Verificação de ${nome}`);
    return { nome, estado: 'ok' };
  } catch (error) {
    return {
      nome,
      estado: 'falha',
      detalhe: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Health check real: consulta o banco e valida o contrato de schema.
 *
 * Um health que só responde 200 esconde exatamente o tipo de falha que
 * derrubou o V1 — banco acessível, mas com schema divergente.
 *
 * As verificações rodam em paralelo e com timeout: um banco lento não pode
 * pendurar o próprio endpoint que existe para denunciar que ele está lento.
 */
export async function verificarSaude(deps: DependenciasBoot): Promise<Saude> {
  const agora = (deps.agora ?? (() => new Date()))();
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_SAUDE_MS;

  const itens = await Promise.all([
    verificar('supabase', () => deps.cliente.selecionarUm('leads', {}), timeoutMs),
    verificar('schema', () => garantirSchema(deps.leitorSchema), timeoutMs),
  ]);

  return {
    saudavel: itens.every((item) => item.estado === 'ok'),
    itens,
    verificadoEm: agora.toISOString(),
  };
}

export class BootError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BootError';
  }
}

/**
 * Sequência de inicialização: ambiente válido antes de conectar, schema
 * conferido antes de aceitar tráfego. Falhar aqui é barato; falhar depois,
 * dentro de um webhook, custa a mensagem do lead.
 */
export async function iniciar(
  deps: DependenciasBoot,
  fonteAmbiente?: Record<string, string | undefined>,
): Promise<Ambiente> {
  const ambiente = carregarAmbiente(fonteAmbiente);

  try {
    await garantirSchema(deps.leitorSchema);
  } catch (error) {
    throw new BootError('Schema do banco incompatível com o contrato do código.', {
      cause: error,
    });
  }

  if (deps.client !== undefined) {
    await validarSchemaSupabase(deps.client);
    console.log('✅ Conexão Supabase e schema validados.');
  }

  return ambiente;
}
