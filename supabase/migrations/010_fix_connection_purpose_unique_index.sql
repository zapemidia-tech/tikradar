-- 010_fix_connection_purpose_unique_index.sql
-- Corrige uma aplicação PARCIAL da migration 009 em produção.
--
-- Diagnóstico (2026-09-13, via upsert de teste contra tiktok_connections,
-- descartado logo em seguida — nenhuma linha real foi tocada): a coluna
-- `connection_purpose` existe (009 rodou até ali), mas nenhum índice único
-- cobre (platform_user_id, open_id[, connection_purpose]) — nem o antigo
-- (`tiktok_connections_platform_user_open_idx`, derrubado pelo `drop index`
-- da 009) nem o novo (`tiktok_connections_user_open_purpose_idx`, cujo
-- `create unique index` da 009 aparentemente não chegou a rodar). Sem esse
-- índice, TODO upsert com `onConflict:'platform_user_id,open_id,
-- connection_purpose'` (services/tiktok/token-store.ts) falha com
-- `42P10 — there is no unique or exclusion constraint matching the ON
-- CONFLICT specification`, que o callback expõe como `error=save_failed`.
-- Isso afeta os dois propósitos por igual (own_shop e, se algum dia
-- precisar re-salvar, bestsellers_sync também) — não é específico de
-- "Minha loja".
--
-- Esta migration só recria o índice que faltou; não mexe em nenhuma linha
-- existente. Idempotente e segura para reexecutar (inclusive se o ambiente
-- já tiver o índice certo, ou ainda tiver o antigo por algum motivo).

drop index if exists public.tiktok_connections_platform_user_open_idx;

create unique index if not exists tiktok_connections_user_open_purpose_idx
  on public.tiktok_connections (platform_user_id, open_id, connection_purpose)
  where platform_user_id is not null;
