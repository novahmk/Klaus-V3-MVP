import type { SupabaseClient } from '@supabase/supabase-js';

interface SchemaValidacao {
  tabela: string;
  colunasEsperadas: string[];
}

const ESQUEMA_ESPERADO: SchemaValidacao[] = [
  {
    tabela: 'leads',
    colunasEsperadas: [
      'id',
      'telefone',
      'nome',
      'estagio',
      'controle_manual',
      'ultima_mensagem',
      'ultima_interacao',
      'criado_em',
    ],
  },
  {
    tabela: 'mensagens',
    colunasEsperadas: ['id', 'lead_id', 'conteudo', 'direcao', 'criado_em'],
  },
  {
    tabela: 'config_ia',
    colunasEsperadas: [
      'id',
      'persona',
      'objetivo',
      'tom_de_voz',
      'contexto',
      'nao_prometer',
      'sempre_confirmar',
      'escalar_humano_quando',
    ],
  },
  {
    tabela: 'regras_conversa',
    colunasEsperadas: ['id', 'rule_name', 'config', 'created_at'],
  },
];

/**
 * Validação direta contra `information_schema.columns` no Supabase.
 *
 * Roda no boot, antes do servidor aceitar tráfego: uma credencial errada ou
 * uma tabela ausente precisa derrubar o processo com uma mensagem clara, não
 * falhar silenciosamente dentro do primeiro webhook recebido.
 */
export async function validarSchemaSupabase(cliente: SupabaseClient): Promise<void> {
  try {
    for (const validacao of ESQUEMA_ESPERADO) {
      const { data, error } = await cliente
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', validacao.tabela);

      if (error || !data) {
        throw new Error(`Tabela '${validacao.tabela}' não encontrada em Supabase.`);
      }

      const colunasEncontradas = data.map((row: { column_name: string }) => row.column_name);
      const colunasAusentes = validacao.colunasEsperadas.filter(
        (col) => !colunasEncontradas.includes(col),
      );

      if (colunasAusentes.length > 0) {
        throw new Error(
          `Tabela '${validacao.tabela}' falta colunas: ${colunasAusentes.join(', ')}`,
        );
      }

      console.log(`✅ Tabela '${validacao.tabela}' validada.`);
    }

    console.log('✅ Schema Supabase validado com sucesso.');
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    throw new Error(`Validação de schema Supabase falhou: ${mensagem}`);
  }
}
