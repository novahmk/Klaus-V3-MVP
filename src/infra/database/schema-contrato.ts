/**
 * Contrato de dados canônico do Klaus V3.
 *
 * Esta é a definição que o código espera encontrar no banco. Ela existe para
 * ser comparada com o `information_schema` real (ver `verificar-schema.ts`):
 * a causa raiz dos quatro bugs do V1 foi divergência silenciosa entre o que o
 * código consultava e o que o banco tinha.
 *
 * Deve ser mantida em sincronia com `migrations/0001_baseline.sql`.
 */

export type Nulabilidade = 'obrigatoria' | 'opcional';

export interface ColunaEsperada {
  nome: string;
  tipo: string;
  nulabilidade: Nulabilidade;
}

export interface TabelaEsperada {
  nome: string;
  colunas: ColunaEsperada[];
}

function obrigatoria(nome: string, tipo: string): ColunaEsperada {
  return { nome, tipo, nulabilidade: 'obrigatoria' };
}

function opcional(nome: string, tipo: string): ColunaEsperada {
  return { nome, tipo, nulabilidade: 'opcional' };
}

export const CONTRATO_SCHEMA: TabelaEsperada[] = [
  {
    nome: 'leads',
    colunas: [
      obrigatoria('id', 'uuid'),
      obrigatoria('telefone', 'text'),
      opcional('nome', 'text'),
      obrigatoria('controle_manual', 'boolean'),
      obrigatoria('estagio', 'text'),
      obrigatoria('opt_out', 'boolean'),
      opcional('ultima_mensagem', 'text'),
      opcional('ultima_interacao', 'timestamp with time zone'),
      obrigatoria('criado_em', 'timestamp with time zone'),
    ],
  },
  {
    nome: 'mensagens',
    colunas: [
      obrigatoria('id', 'uuid'),
      // UUID com FK para leads(id). Gravar dígitos de telefone aqui foi o bug
      // que impedia a mensagem de aparecer na tela de conversa.
      obrigatoria('lead_id', 'uuid'),
      obrigatoria('direcao', 'text'),
      obrigatoria('conteudo', 'text'),
      opcional('wa_message_id', 'text'),
      obrigatoria('criado_em', 'timestamp with time zone'),
    ],
  },
  {
    nome: 'followup_config',
    colunas: [
      obrigatoria('id', 'integer'),
      obrigatoria('max_followups', 'integer'),
      obrigatoria('intervalo_dias', 'integer'),
      obrigatoria('parar_aos_fins_de_semana', 'boolean'),
      // TIME, não INT: o V1 tratava horário como número e nunca casava.
      obrigatoria('horario_inicio', 'time without time zone'),
      obrigatoria('horario_fim', 'time without time zone'),
    ],
  },
  {
    nome: 'followup_modelos',
    colunas: [
      obrigatoria('id', 'uuid'),
      obrigatoria('ordem', 'integer'),
      obrigatoria('titulo', 'text'),
      obrigatoria('mensagem', 'text'),
      obrigatoria('ativo', 'boolean'),
    ],
  },
  {
    nome: 'regras_conversa',
    colunas: [
      obrigatoria('id', 'integer'),
      obrigatoria('nao_prometer', 'ARRAY'),
      obrigatoria('sempre_confirmar', 'ARRAY'),
      obrigatoria('escalar_humano_quando', 'ARRAY'),
    ],
  },
  {
    nome: 'config_scoring',
    colunas: [
      obrigatoria('id', 'integer'),
      obrigatoria('limiar_handoff', 'numeric'),
      obrigatoria('peso_intencao', 'numeric'),
      obrigatoria('peso_engajamento', 'numeric'),
      obrigatoria('peso_contexto', 'numeric'),
      obrigatoria('peso_historico', 'numeric'),
    ],
  },
  {
    nome: 'lead_fatos',
    colunas: [
      obrigatoria('id', 'uuid'),
      obrigatoria('lead_id', 'uuid'),
      obrigatoria('conteudo', 'text'),
      obrigatoria('categoria', 'text'),
      obrigatoria('importancia', 'numeric'),
      obrigatoria('criado_em', 'timestamp with time zone'),
      opcional('ultimo_uso_em', 'timestamp with time zone'),
    ],
  },
  {
    nome: 'config_ia',
    colunas: [
      obrigatoria('id', 'integer'),
      obrigatoria('persona', 'text'),
      obrigatoria('objetivo', 'text'),
      opcional('tom_de_voz', 'text'),
      opcional('contexto', 'text'),
      obrigatoria('atualizado_em', 'timestamp with time zone'),
    ],
  },
  {
    nome: 'followup_envios',
    colunas: [
      obrigatoria('id', 'uuid'),
      obrigatoria('lead_id', 'uuid'),
      obrigatoria('ordem', 'integer'),
      obrigatoria('enviado_em', 'timestamp with time zone'),
    ],
  },
  {
    nome: 'travas',
    colunas: [
      obrigatoria('nome', 'text'),
      obrigatoria('dono', 'text'),
      obrigatoria('expira_em', 'timestamp with time zone'),
    ],
  },
];

export const TABELAS_DO_CONTRATO = CONTRATO_SCHEMA.map((tabela) => tabela.nome);
