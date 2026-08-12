import { TABELA_LEADS } from './constants.js';
import { PersistenciaError } from './errors.js';
import type { Lead, PersistenciaDependencies } from './types.js';

export const LIMITE_PADRAO_LEADS = 50;
export const LIMITE_MAXIMO_LEADS = 200;

export interface ConsultaLeads {
  estagio?: string;
  pagina?: number;
  limite?: number;
}

export interface PaginaDeLeads {
  leads: Lead[];
  total: number;
  pagina: number;
  limite: number;
}

/**
 * Listagem paginada para o Kanban.
 *
 * O limite é sempre aplicado, mesmo que o cliente peça mais: uma tela de
 * dashboard não pode derrubar o backend pedindo a tabela inteira.
 */
export async function listarLeads(
  deps: PersistenciaDependencies,
  consulta: ConsultaLeads = {},
): Promise<PaginaDeLeads> {
  const limite = Math.min(consulta.limite ?? LIMITE_PADRAO_LEADS, LIMITE_MAXIMO_LEADS);
  const pagina = Math.max(consulta.pagina ?? 1, 1);
  const filtros: Record<string, string> =
    consulta.estagio === undefined ? {} : { estagio: consulta.estagio };

  try {
    const [leads, total] = await Promise.all([
      deps.cliente.selecionarTodos<Lead>(TABELA_LEADS, filtros, {
        ordenacao: { coluna: 'ultima_interacao', ascendente: false },
        limite,
        deslocamento: (pagina - 1) * limite,
      }),
      deps.cliente.contar(TABELA_LEADS, filtros),
    ]);

    return { leads, total, pagina, limite };
  } catch (error) {
    throw new PersistenciaError('Falha ao listar leads.', TABELA_LEADS, { cause: error });
  }
}

export async function buscarLeadPorId(
  deps: PersistenciaDependencies,
  leadId: string,
): Promise<Lead | null> {
  try {
    return await deps.cliente.selecionarUm<Lead>(TABELA_LEADS, { id: leadId });
  } catch (error) {
    throw new PersistenciaError(`Falha ao buscar lead ${leadId}.`, TABELA_LEADS, { cause: error });
  }
}

/**
 * Usado pelo botão "assumir conversa" do dashboard, que conhece o lead pelo id
 * e não pelo telefone.
 */
export async function definirControleManualPorId(
  deps: PersistenciaDependencies,
  leadId: string,
  ativo: boolean,
): Promise<Lead | null> {
  const lead = await buscarLeadPorId(deps, leadId);

  if (lead === null) {
    return null;
  }

  try {
    await deps.cliente.atualizarPorId(TABELA_LEADS, leadId, { controle_manual: ativo });
  } catch (error) {
    throw new PersistenciaError(
      `Falha ao alterar controle manual do lead ${leadId}.`,
      TABELA_LEADS,
      { cause: error },
    );
  }

  return { ...lead, controle_manual: ativo };
}
