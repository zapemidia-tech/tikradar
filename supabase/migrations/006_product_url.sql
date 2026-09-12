-- 006_product_url.sql
-- Coluna para a URL real da página do produto na TikTok Shop, usada para
-- tornar a miniatura do produto clicável (abre em nova aba a página real).
--
-- Confirmado em 2026-09-12 inspecionando `raw_payload` de TODOS os
-- registros então sincronizados (2.161 product_snapshots + amostras de
-- video/creator/live_snapshots): nenhuma resposta real da API traz um campo
-- de link do produto. O payload real de produtos só contém `id, name, rank,
-- rating, shop_id, shop_name, gmv_range, product_image` (as urls dentro de
-- `product_image` são da IMAGEM, não da página do produto).
--
-- Por isso esta coluna fica sempre NULL por enquanto — nenhum código deste
-- projeto a preenche a partir do `product_id` (isso seria inventar um link).
-- Ela existe pronta para quando uma sincronização futura capturar um campo
-- real de link (ver comentário em services/tiktok/adapters.ts, função
-- `productUrlFrom`), sem precisar de outra migration.
--
-- Idempotente: pode ser reexecutada sem efeito colateral.

alter table public.products
  add column if not exists product_url text;

comment on column public.products.product_url is
  'URL real da página do produto na TikTok Shop. NULL até que a API passe a retornar esse campo (ver services/tiktok/adapters.ts) — nunca preenchido a partir do product_id.';
