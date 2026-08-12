-- Configuração da IA (singleton).
--
-- O V1 espalhava isso em cfg_ia_persona, cfg_ia_objetivo, cfg_ia_tom_voz,
-- cfg_ia_contexto e cfg_ia_regras — cinco tabelas para um formulário só.
-- Aqui é uma linha única, que corresponde a uma tela do dashboard.

create table if not exists config_ia (
  id            integer primary key default 1 check (id = 1),
  persona       text not null default 'Consultor comercial cordial e objetivo.',
  objetivo      text not null default 'Qualificar o lead e agendar uma conversa com o time.',
  tom_de_voz    text,
  contexto      text,
  atualizado_em timestamptz not null default now()
);

insert into config_ia (id) values (1) on conflict (id) do nothing;
