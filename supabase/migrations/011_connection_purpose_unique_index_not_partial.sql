-- 011_connection_purpose_unique_index_not_partial.sql
-- Substitui o índice único parcial criado pela 010 por um NÃO parcial nas
-- mesmas 3 colunas — o parcial não resolve o problema.
--
-- Diagnóstico (2026-09-13, via upsert de teste contra tiktok_connections,
-- sempre descartado logo em seguida — nenhuma linha real foi tocada):
-- mesmo com `tiktok_connections_user_open_purpose_idx UNIQUE
-- (platform_user_id, open_id, connection_purpose) WHERE platform_user_id
-- IS NOT NULL` existindo, o upsert do PostgREST (`onConflict:
-- 'platform_user_id,open_id,connection_purpose'`, em
-- lib/tiktok/token-store.ts) continua falhando com `42P10`. Motivo: o
-- Postgres só aceita um índice único PARCIAL como "arbiter" de um
-- `ON CONFLICT (colunas)` quando a cláusula ON CONFLICT também repete o
-- predicado (`ON CONFLICT (colunas) WHERE ...`) — e o PostgREST/supabase-js
-- não tem como expressar esse predicado pela opção `onConflict` (só aceita
-- uma lista de colunas). Ou seja: um índice parcial nunca vai funcionar
-- aqui, não importa qual predicado — precisa ser um índice único comum.
--
-- Antes de trocar, foi checado se não há duplicatas em (platform_user_id,
-- open_id, connection_purpose) que impediriam um índice não-parcial:
-- confirmado em produção que há só 1 linha na tabela, sem duplicatas e sem
-- platform_user_id nulo — a checagem de duplicatas fica no passo abaixo
-- também, via NOT EXISTS, para o caso de esta migration rodar depois de
-- mais conexões existirem.
--
-- Não apaga nenhuma linha. Idempotente (o índice novo é `if not exists`; a
-- criação só é tentada se não houver duplicata, então reexecutar é seguro).

do $$
begin
  if exists (
    select 1
    from public.tiktok_connections
    group by platform_user_id, open_id, connection_purpose
    having count(*) > 1
  ) then
    raise exception 'tiktok_connections tem duplicatas em (platform_user_id, open_id, connection_purpose) — resolva-as antes de rodar esta migration (nenhuma linha foi apagada).';
  end if;
end $$;

drop index if exists public.tiktok_connections_user_open_purpose_idx;

create unique index if not exists tiktok_connections_user_open_purpose_uidx
  on public.tiktok_connections (platform_user_id, open_id, connection_purpose);
