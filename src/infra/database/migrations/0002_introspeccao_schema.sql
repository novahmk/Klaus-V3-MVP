-- Função de introspecção usada pelo guard anti-drift.
-- O PostgREST não expõe information_schema diretamente, então o backend lê os
-- metadados por RPC. A função só devolve nome/tipo/nulabilidade de colunas do
-- schema public — nenhum dado de negócio.

create or replace function klaus_listar_colunas(tabelas text[])
returns table (
  table_name  text,
  column_name text,
  data_type   text,
  is_nullable text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text
  from information_schema.columns as c
  where c.table_schema = 'public'
    and c.table_name = any (tabelas)
$$;

-- Metadado de schema não deve ficar exposto a clientes anônimos.
revoke execute on function klaus_listar_colunas(text[]) from public;
revoke execute on function klaus_listar_colunas(text[]) from anon;
grant execute on function klaus_listar_colunas(text[]) to service_role;
