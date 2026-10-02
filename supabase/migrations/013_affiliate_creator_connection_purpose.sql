-- 013_affiliate_creator_connection_purpose.sql
--
-- Terceiro propósito de conexão: 'affiliate_creator' — a autorização da
-- PRÓPRIA conta de criador afiliado do usuário (app TikTok Shop separado,
-- "TikRadar 02", credenciais TIKTOK_CREATOR_APP_KEY/SECRET, nunca as do
-- app seller). Mesma tabela `tiktok_connections` dos outros dois propósitos
-- (`bestsellers_sync`, `own_shop` — ver migration 009 e
-- lib/tiktok/connection-purpose.ts), nunca uma tabela nova: o isolamento já
-- vem de SEMPRE filtrar por `connection_purpose` explícito, nunca "a mais
-- recente de qualquer tipo" (ver token-store.ts, inalterado por esta
-- migration).
--
-- A migration 009 criou a coluna `connection_purpose` com
-- `check (connection_purpose in ('bestsellers_sync', 'own_shop'))` SEM NOME
-- EXPLÍCITO — o Postgres batiza isso com o nome padrão
-- `tiktok_connections_connection_purpose_check`. Em vez de supor que esse é
-- o nome real (uma suposição errada deixaria a constraint antiga pra trás,
-- rejeitando 'affiliate_creator' silenciosamente), este script DESCOBRE o
-- nome de qualquer CHECK constraint que hoje restringe essa coluna, via
-- catálogo do Postgres (pg_constraint/pg_get_constraintdef), e só então a
-- substitui — funciona mesmo que o nome real divirja do padrão.
--
-- O índice único `tiktok_connections_user_open_purpose_uidx` (migration 011)
-- já cobre (platform_user_id, open_id, connection_purpose) SEM depender dos
-- valores aceitos por essa coluna — um novo valor de `connection_purpose`
-- não exige nenhuma mudança nele; não precisa ser tocado aqui.
--
-- Não apaga nem altera nenhuma linha existente (bestsellers_sync/own_shop
-- continuam exatamente como estavam). Idempotente: pode ser reexecutada sem
-- efeito colateral (a nova constraint é recriada do zero toda vez, sempre
-- com a mesma definição).

do $$
declare
  old_constraint_name text;
begin
  select con.conname into old_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'tiktok_connections'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%connection_purpose%'
  limit 1;

  if old_constraint_name is not null then
    execute format('alter table public.tiktok_connections drop constraint %I', old_constraint_name);
  end if;

  alter table public.tiktok_connections
    add constraint tiktok_connections_connection_purpose_check
    check (connection_purpose in ('bestsellers_sync', 'own_shop', 'affiliate_creator'));
end $$;

comment on column public.tiktok_connections.connection_purpose is
  '''bestsellers_sync'' = conexão que alimenta a sincronização de dados públicos Bestsellers. ''own_shop'' = autorização da própria loja do usuário ("Minha loja"). ''affiliate_creator'' = autorização da própria conta de criador afiliado do usuário ("Minha conta de afiliado") — app TikTok Shop separado (credenciais TIKTOK_CREATOR_APP_KEY/SECRET), nunca o mesmo app/token do seller. Nenhum dos três é lido como fallback de outro.';
