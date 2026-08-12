-- Follow-up: registro de envios e trava de agendador.

-- Um envio por lead e ordem. É o que impede o mesmo follow-up de sair duas
-- vezes, mesmo com dois ciclos concorrentes.
create table if not exists followup_envios (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  ordem      integer not null,
  enviado_em timestamptz not null default now()
);

create unique index if not exists followup_envios_lead_ordem
  on followup_envios (lead_id, ordem);

-- Trava cooperativa entre instâncias. Com uma instância só ela é redundante;
-- existe para que escalar não vire disparo duplicado silencioso.
create table if not exists travas (
  nome      text primary key,
  dono      text not null,
  expira_em timestamptz not null
);

/*
 * Aquisição atômica.
 *
 * O insert com on conflict resolve a corrida no próprio banco: duas instâncias
 * chamando ao mesmo tempo, apenas uma recebe true. Fazer isso com
 * select-depois-update deixaria janela para as duas vencerem.
 */
create or replace function klaus_adquirir_trava(
  p_nome text,
  p_dono text,
  p_ttl_segundos integer
) returns boolean
language plpgsql
as $$
declare
  v_adquirida boolean;
begin
  insert into travas (nome, dono, expira_em)
  values (p_nome, p_dono, now() + make_interval(secs => p_ttl_segundos))
  on conflict (nome) do update
    set dono = excluded.dono,
        expira_em = excluded.expira_em
    where travas.expira_em < now()
  returning true into v_adquirida;

  return coalesce(v_adquirida, false);
end;
$$;

create or replace function klaus_liberar_trava(p_nome text, p_dono text)
returns void
language sql
as $$
  delete from travas where nome = p_nome and dono = p_dono;
$$;

revoke execute on function klaus_adquirir_trava(text, text, integer) from public, anon;
revoke execute on function klaus_liberar_trava(text, text) from public, anon;
grant execute on function klaus_adquirir_trava(text, text, integer) to service_role;
grant execute on function klaus_liberar_trava(text, text) to service_role;
