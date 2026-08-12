export const COMPONENT_NAME = 'infra-persistencia';

export const TABELA_LEADS = 'leads';
export const TABELA_MENSAGENS = 'mensagens';
export const TABELA_FOLLOWUP_CONFIG = 'followup_config';
export const TABELA_FOLLOWUP_MODELOS = 'followup_modelos';
export const TABELA_REGRAS_CONVERSA = 'regras_conversa';

export const COLUNA_TELEFONE = 'telefone';
export const COLUNA_LEAD_ID = 'lead_id';

export const DIRECAO_ENTRADA = 'entrada';
export const DIRECAO_SAIDA = 'saida';

export const TELEFONE_MIN_DIGITOS = 10;
export const TELEFONE_MAX_DIGITOS = 15;

export const DIA_DOMINGO = 0;
export const DIA_SABADO = 6;

export const MINUTOS_POR_HORA = 60;

export const FOLLOWUP_CONFIG_PADRAO = {
  max_followups: 3,
  intervalo_dias: 2,
  parar_aos_fins_de_semana: true,
  horario_inicio: '09:00:00',
  horario_fim: '18:00:00',
} as const;

export const REGRAS_CONVERSA_PADRAO = {
  nao_prometer: [],
  sempre_confirmar: [],
  escalar_humano_quando: [],
} as const;
