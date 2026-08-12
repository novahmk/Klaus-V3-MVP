import { describe, expect, it } from 'vitest';

import { CONTRATO_SCHEMA } from './schema-contrato.js';
import {
  SchemaDivergenteError,
  garantirSchema,
  verificarSchema,
} from './verificar-schema.js';
import type { ColunaReal, LeitorSchema } from './verificar-schema.js';

/** Gera o retorno do information_schema equivalente ao contrato declarado. */
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

function leitorCom(colunas: ColunaReal[]): LeitorSchema {
  return {
    listarColunas: () => Promise.resolve(colunas),
  };
}

describe('verificarSchema', () => {
  it('aprova o banco que corresponde ao contrato', async () => {
    const resultado = await verificarSchema(leitorCom(colunasDoContrato()));

    expect(resultado.ok).toBe(true);
    expect(resultado.divergencias).toEqual([]);
  });

  it('detecta tabela ausente', async () => {
    const colunas = colunasDoContrato().filter((coluna) => coluna.table_name !== 'regras_conversa');

    const resultado = await verificarSchema(leitorCom(colunas));

    expect(resultado.ok).toBe(false);
    expect(resultado.divergencias).toContainEqual({
      tipo: 'tabela_ausente',
      tabela: 'regras_conversa',
    });
  });

  it('detecta coluna renomeada', async () => {
    const colunas = colunasDoContrato().filter(
      (coluna) => !(coluna.table_name === 'leads' && coluna.column_name === 'controle_manual'),
    );

    const resultado = await verificarSchema(leitorCom(colunas));

    expect(resultado.divergencias).toContainEqual({
      tipo: 'coluna_ausente',
      tabela: 'leads',
      coluna: 'controle_manual',
    });
  });

  it('detecta o drift de tipo que quebrou o follow-up do V1 (TIME virando integer)', async () => {
    const colunas = colunasDoContrato().map((coluna) =>
      coluna.table_name === 'followup_config' && coluna.column_name === 'horario_inicio'
        ? { ...coluna, data_type: 'integer' }
        : coluna,
    );

    const resultado = await verificarSchema(leitorCom(colunas));

    expect(resultado.ok).toBe(false);
    expect(resultado.divergencias).toContainEqual({
      tipo: 'tipo_divergente',
      tabela: 'followup_config',
      coluna: 'horario_inicio',
      esperado: 'time without time zone',
      encontrado: 'integer',
    });
  });

  it('detecta lead_id perdendo o NOT NULL', async () => {
    const colunas = colunasDoContrato().map((coluna) =>
      coluna.table_name === 'mensagens' && coluna.column_name === 'lead_id'
        ? { ...coluna, is_nullable: 'YES' as const }
        : coluna,
    );

    const resultado = await verificarSchema(leitorCom(colunas));

    expect(resultado.divergencias).toContainEqual({
      tipo: 'nulabilidade_divergente',
      tabela: 'mensagens',
      coluna: 'lead_id',
      esperado: 'obrigatoria',
      encontrado: 'opcional',
    });
  });

  it('ignora colunas extras criadas pelo dashboard', async () => {
    const colunas = [
      ...colunasDoContrato(),
      {
        table_name: 'leads',
        column_name: 'campo_do_dashboard',
        data_type: 'text',
        is_nullable: 'YES' as const,
      },
    ];

    const resultado = await verificarSchema(leitorCom(colunas));

    expect(resultado.ok).toBe(true);
  });
});

describe('garantirSchema', () => {
  it('não lança quando o schema está correto', async () => {
    await expect(garantirSchema(leitorCom(colunasDoContrato()))).resolves.toBeUndefined();
  });

  it('lança com a lista de divergências quando há drift', async () => {
    const colunas = colunasDoContrato().filter((coluna) => coluna.table_name !== 'mensagens');

    await expect(garantirSchema(leitorCom(colunas))).rejects.toBeInstanceOf(SchemaDivergenteError);
  });

  it('inclui a descrição da divergência na mensagem do erro', async () => {
    const colunas = colunasDoContrato().filter((coluna) => coluna.table_name !== 'mensagens');

    await expect(garantirSchema(leitorCom(colunas))).rejects.toThrow(/mensagens/);
  });
});
