import { PersistenciaError } from '../persistencia/errors.js';
import { ConflitoUnicoError } from '../persistencia/errors.js';
import type { PersistenciaDependencies } from '../persistencia/index.js';
import { normalizarTermo } from './resumo.js';

export const TABELA_LEAD_FATOS = 'lead_fatos';

/** Similaridade mínima para um fato ser considerado relevante à pergunta. */
export const SIMILARIDADE_MINIMA = 0.12;

export const MAX_FATOS_RECUPERADOS = 5;

const TAMANHO_MINIMO_TERMO = 4;

export type CategoriaFato =
  | 'identidade'
  | 'preferencia'
  | 'restricao'
  | 'contexto'
  | 'qualificacao';

export interface LeadFato {
  id: string;
  lead_id: string;
  conteudo: string;
  categoria: CategoriaFato;
  importancia: number;
  criado_em: string;
  ultimo_uso_em: string | null;
}

export interface NovoFato {
  conteudo: string;
  categoria?: CategoriaFato;
  importancia?: number;
}

function termos(texto: string): Set<string> {
  return new Set(
    texto
      .split(/[^\p{L}\p{N}]+/u)
      .map(normalizarTermo)
      .filter((termo) => termo.length >= TAMANHO_MINIMO_TERMO),
  );
}

/** Jaccard entre os termos da consulta e os do fato. */
export function calcularSimilaridade(consulta: string, fato: string): number {
  const a = termos(consulta);
  const b = termos(fato);

  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let intersecao = 0;

  for (const termo of a) {
    if (b.has(termo)) {
      intersecao += 1;
    }
  }

  const uniao = a.size + b.size - intersecao;

  return uniao === 0 ? 0 : intersecao / uniao;
}

/**
 * Registra um fato durável do lead. Repetir o mesmo fato não duplica: o índice
 * único em (lead_id, conteudo) trata a corrida e o conflito é absorvido.
 */
export async function registrarFato(
  deps: PersistenciaDependencies,
  leadId: string,
  fato: NovoFato,
): Promise<LeadFato | null> {
  const conteudo = fato.conteudo.trim();

  if (conteudo.length === 0) {
    return null;
  }

  const agora = (deps.agora ?? (() => new Date()))();

  try {
    return await deps.cliente.inserirUm<LeadFato>(TABELA_LEAD_FATOS, {
      lead_id: leadId,
      conteudo,
      categoria: fato.categoria ?? 'contexto',
      importancia: fato.importancia ?? 0.5,
      criado_em: agora.toISOString(),
      ultimo_uso_em: null,
    });
  } catch (error) {
    if (error instanceof ConflitoUnicoError) {
      return null;
    }

    throw new PersistenciaError(
      `Falha ao registrar fato do lead ${leadId}.`,
      TABELA_LEAD_FATOS,
      { cause: error },
    );
  }
}

export async function listarFatosDoLead(
  deps: PersistenciaDependencies,
  leadId: string,
): Promise<LeadFato[]> {
  try {
    return await deps.cliente.selecionarTodos<LeadFato>(TABELA_LEAD_FATOS, { lead_id: leadId });
  } catch (error) {
    throw new PersistenciaError(`Falha ao listar fatos do lead ${leadId}.`, TABELA_LEAD_FATOS, {
      cause: error,
    });
  }
}

/**
 * Recupera os fatos relevantes para a mensagem atual.
 *
 * O corte é aplicado sobre a SIMILARIDADE; a importância só desempata entre
 * fatos já considerados relevantes. Somar importância ao score antes do corte
 * faria um fato importante e totalmente fora de contexto entrar sempre — é um
 * erro comum nesse tipo de implementação.
 *
 * Restrições explícitas do lead são exceção deliberada: entram sempre, porque
 * violar uma delas custa o lead.
 */
export async function recuperarFatosRelevantes(
  deps: PersistenciaDependencies,
  leadId: string,
  consulta: string,
  limite: number = MAX_FATOS_RECUPERADOS,
): Promise<LeadFato[]> {
  const fatos = await listarFatosDoLead(deps, leadId);

  if (fatos.length === 0) {
    return [];
  }

  const restricoes = fatos.filter((fato) => fato.categoria === 'restricao');
  const demais = fatos
    .filter((fato) => fato.categoria !== 'restricao')
    .map((fato) => ({ fato, similaridade: calcularSimilaridade(consulta, fato.conteudo) }))
    .filter((item) => item.similaridade >= SIMILARIDADE_MINIMA)
    .sort((a, b) =>
      b.similaridade === a.similaridade
        ? b.fato.importancia - a.fato.importancia
        : b.similaridade - a.similaridade,
    )
    .map((item) => item.fato);

  return [...restricoes, ...demais].slice(0, limite);
}

/**
 * Apaga a memória de longo prazo do lead.
 *
 * Fatos extraídos de conversa são dado pessoal: quando o lead pede para não ser
 * mais contatado, suspender o follow-up não basta.
 */
export async function esquecerLead(
  deps: PersistenciaDependencies,
  leadId: string,
): Promise<number> {
  try {
    return await deps.cliente.excluir(TABELA_LEAD_FATOS, { lead_id: leadId });
  } catch (error) {
    throw new PersistenciaError(
      `Falha ao apagar a memória do lead ${leadId}.`,
      TABELA_LEAD_FATOS,
      { cause: error },
    );
  }
}

export function formatarFatosParaPrompt(fatos: LeadFato[]): string {
  if (fatos.length === 0) {
    return '';
  }

  return fatos.map((fato) => `- [${fato.categoria}] ${fato.conteudo}`).join('\n');
}
