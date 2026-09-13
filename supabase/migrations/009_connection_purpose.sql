-- 009_connection_purpose.sql
-- "Minha loja TikTok Shop" (autorização de vendedor) usa a MESMA tabela
-- `tiktok_connections` que já guarda a conexão que alimenta a sincronização
-- de dados públicos Bestsellers — sem uma coluna para distinguir o
-- propósito, reconectar "Minha loja" (mesmo `platform_user_id`) podia virar
-- a conexão "mais recente" e ser lida por engano pela sincronização
-- Bestsellers (`TikTokShopProvider`/`createTikTokSyncService`, que buscavam
-- só "a conexão mais recente deste usuário", sem filtrar por propósito).
--
-- Esta migration adiciona `connection_purpose` para eliminar essa ambiguidade
-- na fonte: toda leitura/escrita passa a exigir o propósito explicitamente
-- (ver lib/tiktok/connection-purpose.ts e lib/tiktok/token-store.ts).
--
-- Confirmado em produção em 2026-09-13: existe hoje 1 única linha em
-- tiktok_connections (seller_name começando com "SANDBOX_" — uma loja de
-- desenvolvimento/teste), que é exatamente a conexão que alimenta o
-- Bestsellers. O valor padrão abaixo ('bestsellers_sync') preserva essa
-- linha existente sem precisar de nenhum backfill manual.
--
-- Idempotente: pode ser reexecutada sem efeito colateral.

alter table public.tiktok_connections
  add column if not exists connection_purpose text not null default 'bestsellers_sync'
    check (connection_purpose in ('bestsellers_sync', 'own_shop'));

comment on column public.tiktok_connections.connection_purpose is
  '''bestsellers_sync'' = conexão que alimenta a sincronização de dados públicos Bestsellers (nunca sobrescrita pelo fluxo "Minha loja"). ''own_shop'' = autorização da própria loja do usuário ("Minha loja") — hoje só prova a autorização, não alimenta nenhuma sincronização.';

-- Substitui o índice único (platform_user_id, open_id) por um que inclui o
-- propósito: permite que o MESMO usuário (e, em tese, a mesma conta TikTok)
-- tenha uma linha 'bestsellers_sync' e outra 'own_shop' sem conflito de
-- upsert — hoje um upsert de "Minha loja" poderia colidir com a linha do
-- Bestsellers se ambos usassem o mesmo open_id.
drop index if exists public.tiktok_connections_platform_user_open_idx;

create unique index if not exists tiktok_connections_user_open_purpose_idx
  on public.tiktok_connections (platform_user_id, open_id, connection_purpose)
  where platform_user_id is not null;
