import { randomUUID } from 'node:crypto';

import {
  COLUNA_LEAD_ID,
  COLUNA_TELEFONE,
  TABELA_LEADS,
  TABELA_MENSAGENS,
} from './constants.js';
import { ConflitoUnicoError } from './errors.js';
import type { ClienteSupabase, OpcoesConsulta, ValorFiltro } from './types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Linha = Record<string, unknown>;

/**
 * Cliente em memória que reproduz as restrições do banco real: `mensagens.lead_id`
 * é UUID NOT NULL com FK para `leads(id)`. Usado para exercitar a camada de
 * persistência sem rede.
 */
export class ClienteMemoria implements ClienteSupabase {
  private readonly tabelas = new Map<string, Linha[]>();

  constructor(seed: Record<string, Linha[]> = {}) {
    for (const [tabela, linhas] of Object.entries(seed)) {
      this.tabelas.set(
        tabela,
        linhas.map((linha) => ({ ...linha })),
      );
    }
  }

  linhas(tabela: string): Linha[] {
    return this.tabelas.get(tabela) ?? [];
  }

  private corresponde(linha: Linha, filtros: Record<string, ValorFiltro>): boolean {
    return Object.entries(filtros).every(([coluna, valor]) => linha[coluna] === valor);
  }

  selecionarUm<T>(tabela: string, filtros: Record<string, ValorFiltro>): Promise<T | null> {
    const encontrada = this.linhas(tabela).find((linha) => this.corresponde(linha, filtros));

    return Promise.resolve(encontrada === undefined ? null : ({ ...encontrada } as T));
  }

  selecionarTodos<T>(
    tabela: string,
    filtros: Record<string, ValorFiltro>,
    opcoes?: OpcoesConsulta,
  ): Promise<T[]> {
    let resultado = this.linhas(tabela)
      .filter((linha) => this.corresponde(linha, filtros))
      .map((linha) => ({ ...linha }));

    const ordenacao = opcoes?.ordenacao;

    if (ordenacao !== undefined) {
      const { coluna, ascendente } = ordenacao;

      resultado.sort((a, b) => {
        const valorA = String(a[coluna] ?? '');
        const valorB = String(b[coluna] ?? '');
        const comparacao = valorA.localeCompare(valorB, undefined, { numeric: true });

        return ascendente ? comparacao : -comparacao;
      });
    }

    if (opcoes?.deslocamento !== undefined) {
      resultado = resultado.slice(opcoes.deslocamento);
    }

    if (opcoes?.limite !== undefined) {
      resultado = resultado.slice(0, opcoes.limite);
    }

    return Promise.resolve(resultado as T[]);
  }

  contar(tabela: string, filtros: Record<string, ValorFiltro>): Promise<number> {
    return Promise.resolve(
      this.linhas(tabela).filter((linha) => this.corresponde(linha, filtros)).length,
    );
  }

  inserirUm<T>(tabela: string, valores: Linha): Promise<T> {
    if (tabela === TABELA_MENSAGENS) {
      this.validarChaveEstrangeira(valores);
    }

    try {
      this.validarUnicidade(tabela, valores);
    } catch (error) {
      return Promise.reject(error);
    }

    const linha: Linha = { id: randomUUID(), ...valores };
    const existentes = this.linhas(tabela);

    existentes.push(linha);
    this.tabelas.set(tabela, existentes);

    return Promise.resolve({ ...linha } as T);
  }

  /** Reproduz os índices únicos declarados na migration baseline. */
  private validarUnicidade(tabela: string, valores: Linha): void {
    if (tabela === TABELA_LEADS) {
      const telefone = valores[COLUNA_TELEFONE];
      const duplicado = this.linhas(TABELA_LEADS).some(
        (lead) => lead[COLUNA_TELEFONE] === telefone,
      );

      if (duplicado) {
        throw new ConflitoUnicoError(TABELA_LEADS, 'leads_telefone_unico');
      }
    }

    if (tabela === TABELA_MENSAGENS) {
      const waMessageId = valores['wa_message_id'];
      const duplicado =
        typeof waMessageId === 'string' &&
        this.linhas(TABELA_MENSAGENS).some((mensagem) => mensagem['wa_message_id'] === waMessageId);

      if (duplicado) {
        throw new ConflitoUnicoError(TABELA_MENSAGENS, 'mensagens_wa_message_id_unico');
      }
    }

    // followup_envios (lead_id, ordem): é o que impede o mesmo follow-up de
    // sair duas vezes quando dois ciclos concorrem.
    if (tabela === 'followup_envios') {
      const duplicado = this.linhas(tabela).some(
        (envio) => envio['lead_id'] === valores['lead_id'] && envio['ordem'] === valores['ordem'],
      );

      if (duplicado) {
        throw new ConflitoUnicoError(tabela, 'followup_envios_lead_ordem');
      }
    }
  }

  atualizarPorId(tabela: string, id: string, valores: Linha): Promise<void> {
    const linha = this.linhas(tabela).find((candidata) => candidata['id'] === id);

    if (linha === undefined) {
      return Promise.reject(new Error(`Nenhuma linha em ${tabela} com id ${id}.`));
    }

    Object.assign(linha, valores);

    return Promise.resolve();
  }

  excluir(tabela: string, filtros: Record<string, ValorFiltro>): Promise<number> {
    if (Object.keys(filtros).length === 0) {
      return Promise.reject(new Error(`Exclusão sem filtro não é permitida (tabela ${tabela}).`));
    }

    const existentes = this.linhas(tabela);
    const mantidas = existentes.filter((linha) => !this.corresponde(linha, filtros));

    this.tabelas.set(tabela, mantidas);

    return Promise.resolve(existentes.length - mantidas.length);
  }

  private validarChaveEstrangeira(valores: Linha): void {
    const leadId = valores[COLUNA_LEAD_ID];

    if (typeof leadId !== 'string' || !UUID_PATTERN.test(leadId)) {
      throw new Error(
        `violates foreign key constraint: ${COLUNA_LEAD_ID} "${String(leadId)}" não é UUID.`,
      );
    }

    const existe = this.linhas(TABELA_LEADS).some((lead) => lead['id'] === leadId);

    if (!existe) {
      throw new Error(`violates foreign key constraint: lead ${leadId} inexistente.`);
    }
  }
}
