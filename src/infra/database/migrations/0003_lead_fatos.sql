-- Fatos duráveis do lead: a memória de longo prazo do Klaus.
--
-- Ancorada em leads(id), nunca em telefone — mesma regra do resto do sistema.
-- ON DELETE CASCADE garante que apagar o lead apaga a memória dele; o opt-out,
-- que não apaga o lead, é tratado no código (esquecerLead).

create table if not exists lead_fatos (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads (id) on delete cascade,
  conteudo       text not null,
  categoria      text not null default 'contexto'
                 check (categoria in (
                   'identidade', 'preferencia', 'restricao', 'contexto', 'qualificacao'
                 )),
  importancia    numeric not null default 0.5 check (importancia >= 0 and importancia <= 1),
  criado_em      timestamptz not null default now(),
  ultimo_uso_em  timestamptz
);

-- O mesmo fato não deve ser registrado duas vezes para o mesmo lead.
create unique index if not exists lead_fatos_conteudo_unico
  on lead_fatos (lead_id, conteudo);

create index if not exists lead_fatos_lead on lead_fatos (lead_id);
