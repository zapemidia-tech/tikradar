-- 005_video_engagement_and_product_media.sql
-- Colunas para campos que a resposta REAL da TikTok Shop Bestsellers já
-- retorna, mas que ainda não tínhamos onde guardar. Confirmado inspecionando
-- `raw_payload` de sincronizações reais (ver relatório da entrega):
--   video_snapshots.raw_payload: likes, comments, shares, duration,
--     publish_time, views, gmv_range, product_infos[]  (já capturados: views,
--     gmv_*; faltavam os demais)
--   product_snapshots.raw_payload: shop_id, shop_name, product_image
--     (faltava onde persistir a imagem do produto — shop_id/shop_name vão
--     para a tabela shops já existente, sem precisar de coluna nova)
--
-- NÃO adiciona uma coluna de "vendas atribuídas" para vídeos: nenhuma
-- amostra real de products/creators/videos/lives bestselling contém um
-- campo de vendas, pedidos ou unidades vendidas (nem `sales`, nem `orders`,
-- nem `units_sold`/`items_sold`). Inventar essa coluna sem uma fonte
-- violaria a regra de não inventar dado.
--
-- Idempotente: pode ser reexecutada sem efeito colateral.

alter table public.video_snapshots
  add column if not exists likes bigint,
  add column if not exists comments bigint,
  add column if not exists shares bigint,
  add column if not exists duration_seconds bigint,
  add column if not exists publish_time timestamptz,
  add column if not exists engagement_rate numeric(6,2);

comment on column public.video_snapshots.engagement_rate is
  '((likes + comments + shares) / views) * 100, calculado apenas quando views > 0. NULL quando insuficiente.';

-- A imagem do produto (product_image.urls[0] no payload real) fica na
-- entidade, não no snapshot: é uma característica do produto, não algo que
-- muda a cada coleta.
alter table public.products
  add column if not exists image_url text;
