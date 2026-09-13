-- 008_creator_avatar.sql
-- Coluna para a foto de perfil real do criador na TikTok Shop, usada na
-- página /creators (avatar em tamanho legível quando existir; iniciais
-- neutras quando não).
--
-- Confirmado em 2026-09-12 inspecionando `raw_payload` de 500
-- creator_snapshots reais (amostra recente, sobre 1.200 linhas então
-- existentes): a resposta real de creators/bestselling só contém `rank,
-- open_id, gmv_range, nick_name, user_name, likes_count, followers_count`
-- — nenhum campo de foto/avatar. Mesma conclusão da inspeção documentada em
-- 006_product_url.sql para o link de produto.
--
-- Por isso esta coluna fica sempre NULL por enquanto — nenhum código deste
-- projeto a preenche a partir do open_id/nome (isso seria inventar uma
-- foto). Ela existe pronta para quando uma sincronização futura capturar um
-- campo real de imagem (ver `avatarUrlFrom` em services/tiktok/adapters.ts),
-- sem precisar de outra migration.
--
-- Idempotente: pode ser reexecutada sem efeito colateral.

alter table public.creators
  add column if not exists avatar_url text;

comment on column public.creators.avatar_url is
  'URL real da foto de perfil do criador na TikTok Shop. NULL até que a API passe a retornar esse campo (ver services/tiktok/adapters.ts) — nunca preenchido a partir do nome/open_id.';
