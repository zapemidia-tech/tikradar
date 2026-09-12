-- 007_new_in_radar_indexes.sql
-- Índices para a página "Novos no radar" (lib/providers/tiktok-shop-provider.ts,
-- método getNewInRadar) consultar o Supabase de forma eficiente, sem
-- precisar trazer todo o catálogo/histórico para filtrar em memória:
--
--   1. products_created_at_idx — filtra produtos cuja primeira sincronização
--      (products.created_at, nunca alterado depois do primeiro INSERT — ver
--      services/tiktok/sync-repository.ts) caiu nos últimos 7 dias.
--      Confirmado em 2026-09-12, comparando com min(product_snapshots
--      .captured_at) em produção, que products.created_at reflete o
--      instante real da 1ª captura de cada product_id.
--   2. product_snapshots_product_period_idx — busca os snapshots 7D de um
--      conjunto pequeno de product_id (os candidatos já filtrados pelo
--      índice acima), já ordenados por captured_at, sem escanear a tabela
--      inteira de snapshots.
--
-- Puramente aditivo: só cria índices, não muda dado nenhum. Sem essa
-- migration a consulta ainda funciona (o Postgres cai para sequential scan),
-- só fica mais lenta conforme products/product_snapshots crescem.
--
-- Idempotente: pode ser reexecutada sem efeito colateral.

create index if not exists products_created_at_idx
  on public.products(created_at desc);

create index if not exists product_snapshots_product_period_idx
  on public.product_snapshots(product_id, period, captured_at desc);
