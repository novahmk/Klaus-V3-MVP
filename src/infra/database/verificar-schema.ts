import { CONTRATO_SCHEMA, TABELAS_DO_CONTRATO } from './schema-contrato.js';
import type { TabelaEsperada } from './schema-contrato.js';

export interface ColunaReal {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
}

/**
 * Porta de introspecção. O adapter real consulta
 * `information_schema.columns` no Supabase.
 */
export interface LeitorSchema {
  listarColunas(tabelas: string[]): Promise<ColunaReal[]>;
}

export type TipoDivergencia =
  | 'tabela_ausente'
  | 'coluna_ausente'
  | 'tipo_divergente'
  | 'nulabilidade_divergente';

export interface Divergencia {
  tipo: TipoDivergencia;
  tabela: string;
  coluna?: string;
  esperado?: string;
  encontrado?: string;
}

export interface ResultadoVerificacao {
  ok: boolean;
  divergencias: Divergencia[];
}

function descreverDivergencia(divergencia: Divergencia): string {
  const alvo =
    divergencia.coluna === undefined
      ? divergencia.tabela
      : `${divergencia.tabela}.${divergencia.coluna}`;

  if (divergencia.tipo === 'tabela_ausente') {
    return `tabela ausente: ${alvo}`;
  }

  if (divergencia.tipo === 'coluna_ausente') {
    return `coluna ausente: ${alvo}`;
  }

  return `${alvo}: esperado ${String(divergencia.esperado)}, encontrado ${String(
    divergencia.encontrado,
  )}`;
}

export function formatarDivergencias(divergencias: Divergencia[]): string {
  return divergencias.map((divergencia) => `- ${descreverDivergencia(divergencia)}`).join('\n');
}

function verificarTabela(tabela: TabelaEsperada, colunasReais: ColunaReal[]): Divergencia[] {
  const divergencias: Divergencia[] = [];
  const reaisDaTabela = colunasReais.filter((coluna) => coluna.table_name === tabela.nome);

  if (reaisDaTabela.length === 0) {
    return [{ tipo: 'tabela_ausente', tabela: tabela.nome }];
  }

  for (const esperada of tabela.colunas) {
    const real = reaisDaTabela.find((coluna) => coluna.column_name === esperada.nome);

    if (real === undefined) {
      divergencias.push({ tipo: 'coluna_ausente', tabela: tabela.nome, coluna: esperada.nome });
      continue;
    }

    if (real.data_type !== esperada.tipo) {
      divergencias.push({
        tipo: 'tipo_divergente',
        tabela: tabela.nome,
        coluna: esperada.nome,
        esperado: esperada.tipo,
        encontrado: real.data_type,
      });
    }

    const nulabilidadeReal = real.is_nullable === 'YES' ? 'opcional' : 'obrigatoria';

    if (nulabilidadeReal !== esperada.nulabilidade) {
      divergencias.push({
        tipo: 'nulabilidade_divergente',
        tabela: tabela.nome,
        coluna: esperada.nome,
        esperado: esperada.nulabilidade,
        encontrado: nulabilidadeReal,
      });
    }
  }

  return divergencias;
}

/**
 * Compara o contrato declarado no código com o schema real do banco.
 * Colunas extras no banco são ignoradas de propósito: o dashboard pode
 * adicionar campos próprios sem quebrar o backend.
 */
export async function verificarSchema(leitor: LeitorSchema): Promise<ResultadoVerificacao> {
  const colunasReais = await leitor.listarColunas(TABELAS_DO_CONTRATO);
  const divergencias = CONTRATO_SCHEMA.flatMap((tabela) => verificarTabela(tabela, colunasReais));

  return { ok: divergencias.length === 0, divergencias };
}

export class SchemaDivergenteError extends Error {
  readonly divergencias: Divergencia[];

  constructor(divergencias: Divergencia[]) {
    super(`Schema do banco diverge do contrato:\n${formatarDivergencias(divergencias)}`);
    this.name = 'SchemaDivergenteError';
    this.divergencias = divergencias;
  }
}

/**
 * Usado no boot e no CI: falha alto em vez de deixar o sistema rodar
 * escrevendo em colunas que não existem.
 */
export async function garantirSchema(leitor: LeitorSchema): Promise<void> {
  const resultado = await verificarSchema(leitor);

  if (!resultado.ok) {
    throw new SchemaDivergenteError(resultado.divergencias);
  }
}
