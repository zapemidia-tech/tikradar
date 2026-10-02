# Affiliate Creator APIs — fontes oficiais, endpoints efetivos e atribuição por vídeo

Documento escrito **antes** de implementar o painel "Minha conta de
afiliado" (`app/minha-conta-afiliado/`), a partir do Markdown oficial
baixado diretamente da API do Partner Center (`partner.tiktokshop.com`,
`workspace_id=3`, uma por uma, pelo `document_id` de cada página) em
**2026-09-30**. Nunca inferido do editor de código renderizado em JS da doc
pública (que corta texto) nem de suposição.

## Fontes consultadas (nome oficial, path, versão, scope confirmado via `document/api_meta`)

| API | Path efetivo | Método | Scope que cobre (confirmado) |
| --- | --- | --- | --- |
| Creator authorization guide | `https://shop.tiktok.com/alliance/creator/auth` (autorizar) + `https://auth.tiktok-shops.com/api/v2/token/{get,refresh}` (trocar/renovar) | GET | — (fluxo OAuth, não uma API de negócio) |
| Get Creator Profile | `/affiliate_creator/202508/profiles` | GET | `creator.affiliate.info` (ou `creator.video.write`, não ativo) |
| Get Showcase Products | `/affiliate_creator/202405/showcases/products` | GET | `creator.showcase.read` (ou `creator.video.write`, não ativo) |
| Search Creator Affiliate Orders | `/affiliate_creator/202410/orders/search` | POST | `creator.affiliate_collaboration.read` |
| Search Creator Target Collaborations | `/affiliate_creator/202405/target_collaborations/search` | POST | `creator.affiliate_collaboration.read` |

Os 3 scopes ativos no app "TikRadar 02" (`creator.affiliate.info`,
`creator.showcase.read`, `creator.affiliate_collaboration.read`) cobrem os 4
endpoints de negócio acima — nenhum dos 4 fica de fora.

**Legado confirmado como retirado:** `Creator Search Affiliate Trace Orders`
(`POST /affiliate_creator/202505/orders/trace/search`) foi **oficialmente
retirada em 2026-08-15** (changelog "For All Markets: Deprecating the
Creator Search Affiliate Trace Orders API") — a substituta é exatamente a
`Search Creator Affiliate Orders` acima, que é a que este projeto usa.

## Diferenças de transporte vs. as APIs de seller já usadas no projeto

- Autorização: endpoint e parâmetro **diferentes** do seller.
  `shop.tiktok.com/alliance/creator/auth?app_key=...&state=...` (criador,
  `state` **obrigatório** — não incluído no link básico, precisa ser
  concatenado manualmente) vs.
  `services.{region}.tiktokshop.com/open/authorize?service_id=...`
  (seller, `state` opcional). Confirmado literalmente no texto do guia
  oficial.
- Troca/renovação de token: **mesmo** host e paths do seller
  (`auth.tiktok-shops.com/api/v2/token/get` e `/token/refresh`), só muda
  `app_key`/`app_secret` (os do app "TikRadar 02") e o token resultante não
  tem `seller_name`/`seller_base_region`.
- Chamadas de negócio (Get Creator Profile etc.): **mesmo** gateway do
  seller (`open-api.tiktokglobalshop.com`), mesmo algoritmo de assinatura
  (`app_key`+`timestamp`+`sign` na query, `x-tts-access-token` no header,
  confirmado na página oficial "Common parameters": "For API version
  `202309` and later, the access token must be sent in this header"). **Sem
  `shop_cipher`** em nenhum endpoint de criador documentado — criador não
  tem loja.
- `user_type` no token: `1` = criador, `0` = vendedor (confirmado no guia
  oficial). Nunca o mesmo valor trocado entre os dois fluxos.

## Erros confirmados

**Nível OAuth/token** (guia oficial de autorização de criador):
`105005` escopo faltando · `105002` token expirado · `105001` token
inválido/revogado · `101000` identidade de token errada (ex.: token de
seller usado numa API de criador).

**Por endpoint** (página oficial de cada API): Get Creator Profile —
`16015006`/`16015007` (sem região de venda) · `16501011` (sem permissão) ·
`16504002` (falha ao consultar) · `36009002` (rate limit). Get Showcase
Products — `18001405` (sem região de venda) · `36009003` (erro interno).

## Atribuição oficial por vídeo — a pergunta central da Seção 8

### Os pedidos têm identificador de vídeo?

**Sim.** Cada SKU de cada pedido retornado por `Search Creator Affiliate
Orders` traz:

- `content_type` (enum documentado: `SHOP`, `VIDEO`, `LIVE`, `PRE_LIVE`,
  `PROMOTION_PAGE`, `LINKSHARE`)
- `content_id` (string) — "The content identifier for the creator content
  through which the order was created."

Quando `content_type === 'VIDEO'`, `content_id` **é o identificador oficial
do vídeo que gerou a venda** — a própria TikTok está afirmando essa
atribuição, não é uma aproximação nossa.

### Existe API oficial, dentro dos scopes ativos, de desempenho de vídeo do criador?

**Não.** Vasculhado o catálogo completo de 969 páginas do workspace de
documentação (categorias "Affiliate creator", "Affiliate seller",
"Affiliate partner" e a árvore de Analytics inteira). As únicas APIs de
"performance de vídeo" que existem (`Get Video Performances`, `Get Shop
Video Performance List/Details/Overview` etc.) pertencem à categoria
**Analytics do SELLER** — exigem `shop_cipher` e token de vendedor, e
respondem o desempenho da LOJA, não do criador. Dentro da categoria
"Affiliate creator", os únicos endpoints relacionados a vídeo são de
**postagem** (`Upload Shoppable Video File`, `Post Shoppable Video`,
`Precheck Video Content`) — exigem o scope `creator.video.write`, que não
está entre os 3 ativos, e mesmo que estivesse, são APIs de escrita
(publicar vídeo), não de leitura de métricas por vídeo já existente.

**Conclusão: não há, hoje, nenhuma API oficial que resolva um `content_id`
de vídeo em título, miniatura, data de publicação, views, cliques ou CTR
para a conta deste criador**, dentro dos 3 scopes ativos nem fora deles.

### Classificação dos campos

| Campo | Classificação | Fonte |
| --- | --- | --- |
| `content_id` do vídeo (quando `content_type==='VIDEO'`) | **OFICIAL** | `sku.content_id` em Search Creator Affiliate Orders |
| GMV/comissão/pedidos/unidades **agregados por `content_id`** | **OFICIAL** (soma de valores oficiais agrupados por um ID oficial — nunca estimativa) | Agregação de `sku.actual_commission`/`estimated_commission`/`quantity` das próprias respostas, feita em `lib/tiktok/affiliate-creator.ts` (`aggregateVideoSales`) |
| Título do vídeo | **INDISPONÍVEL** | Nenhuma API, dentro dos scopes ativos, resolve `content_id` → título |
| Miniatura do vídeo | **INDISPONÍVEL** | idem |
| Data de publicação do vídeo | **INDISPONÍVEL** | idem |
| Views / cliques / CTR do vídeo | **INDISPONÍVEL** | idem — essas métricas só existem nas APIs de Shop Analytics do seller, que descrevem a loja, não o criador |
| Comissão pendente vs. liquidada | **OFICIAL** | `order.status` (`AWAITING_PAYMENT`/`TO_SETTLE`/`SETTLED`/`REFUNDED`/`FROZEN`) — nunca tratado como liquidada quando pendente |
| Produtos da vitrine, colaborações, perfil do criador | **OFICIAL** | Get Showcase Products / Search Creator Target Collaborations / Get Creator Profile |

### Decisão de produto resultante

O painel mostra um **ranking de vídeos por `content_id`** (GMV, pedidos,
unidades, comissão — todos oficiais) — nunca com título, miniatura ou
métricas de engajamento, porque essas simplesmente não existem numa fonte
oficial acessível. A UI deixa isso explícito (não finge que o `content_id`
é "o vídeo" com nome — mostra como identificador técnico, com uma nota
visível da limitação).

## Outras limitações confirmadas

- **`Search Creator Target Collaborations` exige `shop_id`** no corpo da
  requisição (campo obrigatório, documentado). Não existe, dentro dos 3
  scopes ativos, nenhuma API que liste "todas as lojas com que este
  criador colabora" para descobrir esse `shop_id` automaticamente — nem
  `Get Showcase Products` nem `Search Creator Affiliate Orders` retornam um
  `shop_id` (só `shop.name`/`shop_name`, nomes, nunca o ID). Por isso, o
  painel principal não lista colaborações automaticamente; o diagnóstico
  aceita um `shop_id` opcional informado manualmente, e a limitação é
  mostrada na tela.
- **Moedas por pedido podem variar** (o exemplo oficial usa `IDR`) — nunca
  somadas sem agrupar por `currency` primeiro (mesma regra já aplicada em
  `/minha-loja`).
- **Comissão "estimada" vs. "real"**: a API retorna ambas
  (`estimated_commission`/`actual_commission`) — a UI nunca mistura as
  duas nem assume que a estimada virou a real sem checar `order.status`.
