-- Baseline do schema Klaus V3.
-- Declara o schema canônico com as constraints que faltavam no V1 e que
-- causaram perda silenciosa de dados:
--   * mensagens.lead_id era preenchido com dígitos de telefone, não UUID
--   * leads.telefone sem índice único permitia lead duplicado sob concorrência
--   * reentrega de webhook duplicava mensagem

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- leads
create table if not exists leads (
  id                uuid primary key default gen_random_uuid(),
  telefone          text not null,
  nome              text,
  controle_manual   boolean not null default false,
  estagio           text not null default 'abertura',
  opt_out           boolean not null default false,
  ultima_mensagem   text,
  ultima_interacao  timestamptz,
  criado_em         timestamptz not null default now()
);

-- Impede dois leads para o mesmo número quando dois webhooks chegam juntos.
create unique index if not exists leads_telefone_unico on leads (telefone);

-- ------------------------------------------------------------ mensagens
create table if not exists mensagens (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads (id) on delete cascade,
  direcao        text not null check (direcao in ('entrada', 'saida')),
  conteudo       text not null,
  wa_message_id  text,
  criado_em      timestamptz not null default now()
);

-- Reentrega de webhook do WaSender não pode duplicar mensagem.
create unique index if not exists mensagens_wa_message_id_unico
  on mensagens (wa_message_id)
  where wa_message_id is not null;

create index if not exists mensagens_lead_criado_em
  on mensagens (lead_id, criado_em);

-- ------------------------------------------------------ followup_config
-- Singleton: a linha única é garantida pelo check em id.
create table if not exists followup_config (
  id                        integer primary key default 1 check (id = 1),
  max_followups             integer not null default 3,
  intervalo_dias            integer not null default 2,
  parar_aos_fins_de_semana  boolean not null default true,
  horario_inicio            time not null default '09:00:00',
  horario_fim               time not null default '18:00:00'
);

insert into followup_config (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------- followup_modelos
create table if not exists followup_modelos (
  id        uuid primary key default gen_random_uuid(),
  ordem     integer not null,
  titulo    text not null,
  mensagem  text not null,
  ativo     boolean not null default true
);

create unique index if not exists followup_modelos_ordem_unica
  on followup_modelos (ordem);

-- ------------------------------------------------------ regras_conversa
-- Singleton editado pelo dashboard. Substitui a tabela cfg_regras_conversa,
-- que o agente do V1 lia e que nunca existiu no banco.
create table if not exists regras_conversa (
  id                     integer primary key default 1 check (id = 1),
  nao_prometer           text[] not null default '{}',
  sempre_confirmar       text[] not null default '{}',
  escalar_humano_quando  text[] not null default '{}'
);

insert into regras_conversa (id) values (1) on conflict (id) do nothing;

-- -------------------------------------------------------- config_scoring
create table if not exists config_scoring (
  id                 integer primary key default 1 check (id = 1),
  limiar_handoff     numeric not null default 70,
  peso_intencao      numeric not null default 0.4,
  peso_engajamento   numeric not null default 0.3,
  peso_contexto      numeric not null default 0.2,
  peso_historico     numeric not null default 0.1
);

insert into config_scoring (id) values (1) on conflict (id) do nothing;
