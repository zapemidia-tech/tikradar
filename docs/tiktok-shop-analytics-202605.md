# Campos garantidos vs. opcionais — Shop Analytics 202605

Documento de referência para o painel **Minha loja**
(`app/minha-loja/`, `components/my-shop-dashboard.tsx`,
`lib/tiktok/shop-analytics.ts`). Escrito **antes** de implementar a UI, a
partir do Markdown oficial baixado diretamente da API do Partner Center
(`GET Shop Video Performance List` e `GET Shop Product Performance List`,
versão `202605`) em 2026-09-14, e do comportamento real confirmado no
diagnóstico em produção na mesma data (ver commits anteriores). Nunca
inferido do editor de código renderizado em JS da doc pública (que corta
texto) nem de suposição.

Convenção: **Garantido** = a doc descreve o campo sem "optional"/"if
applicable" e ele apareceu em toda resposta de sucesso observada.
**Opcional/condicional** = a doc ou o comportamento real mostram que o
campo pode faltar, vir vazio ou só existir em certas contas/canais. O app
NUNCA trata "opcional" como "garantido" — todo acesso passa por
`isRecord`/`typeof` (ver `lib/tiktok/shop-analytics.ts`), nunca assume
presença.

## Envelope (igual nos dois endpoints)

| Campo | Garantia | Observação |
| --- | --- | --- |
| `code` | Garantido | `0` = sucesso. Checado ANTES de tudo — ver `client.request`/`assertNoApiErrorCode`. |
| `message` | Garantido | Nunca exibido cru sem sanitização adicional (mas não é sensível por si só). |
| `request_id` | Garantido | Só para suporte/log — nunca usado como chave de negócio. |
| `data` | **Condicional na forma** | Confirmado em produção: em sucesso sem nenhum registro no período, a TikTok pode responder `code:0` **omitindo** a chave `videos`/`products` de `data` inteiramente (em vez do `[]` do Response Sample da doc) — só junto com `data.total_count===0` e sem `data.next_page_token`. Tratado em `parseAnalyticsPage`. |
| `data.total_count` | Garantido quando `data` existe | Usado para decidir "sucesso sem registros" vs. formato inesperado. |
| `data.next_page_token` | Garantido quando `data` existe (pode ser string vazia = sem próxima página) | Nunca usado como prova de identidade/sessão. |
| `data.latest_available_date` | Garantido quando `data` existe | T-1: dado do dia anterior só fica pronto no dia seguinte — o painel sempre mostra essa data, nunca assume "hoje - 1" como certo. |

## Vídeo — `data.videos[]` (202605)

| Campo | Garantia | Observação |
| --- | --- | --- |
| `id` | Garantido (string) | |
| `title` | Garantido (string) | |
| `username` | Garantido (string) | Presente nas duas versões (202509 e 202605); é o autor do vídeo mesmo sem o bloco `creator`. |
| `video_post_time` | Garantido (string) | |
| `duration` | Garantido (int, segundos) | |
| `hash_tags` | Garantido (`[]string`, pode ser vazio) | |
| `gmv` / `gpm` | Garantido (`{amount, currency}`) | `currency` reflete o parâmetro `currency` pedido (USD ou moeda local da loja) — nunca assumido como BRL. |
| `avg_customers` | Garantido (int) | |
| `sku_orders` | Garantido (int) | É o mais próximo de "pedidos" que a API de vídeo documenta — não existe um campo `orders` para vídeo (só para produto). |
| `items_sold` | Garantido (int) | |
| `views` | Garantido (int) | |
| `click_through_rate` | Garantido (string decimal, ex. `"0.0528"`) | Formato **difere** da 202509 (que usa `"12.5%"`) — nunca reformatado/unificado entre versões. |
| `products` | Garantido (`[]object`, pode ser vazio) | Só `{id, name}` por item — usado aqui só para contar quantos produtos aparecem no vídeo. |
| `creator` | **Opcional** — só existe na 202605 | Pode faltar mesmo na 202605 (conta não identificável/anônima); `open_id`, `user_name`, `nick_name`, `author_type` tratados individualmente, nenhum assumido presente só porque o bloco existe. |
| `creator.author_type` | Opcional dentro de `creator` | Enum documentado (`OFFICIAL`, `CHANNEL`, `AFFILIATE`) tratado como string livre — a API pode adicionar um valor novo sem aviso. |

## Produto — `data.products[]` (202605)

| Campo | Garantia | Observação |
| --- | --- | --- |
| `id` | Garantido (string) | |
| `total_performance` | Garantido como bloco, campos internos variam | Funil completo — ver abaixo. Produto **nunca** traz identificação de criador, em nenhuma versão. |
| `total_performance.gmv/orders/sku_orders/items_sold` | Garantido | |
| `total_performance.product_impressions/product_clicks/ctr` | Garantido | |
| `total_performance.add_cart_rate/click_order_rate/estimated_customers` | Garantido | |
| `total_performance.aov` | Garantido (`{amount, currency}`) | Valor médio por pedido — não é preço unitário do produto (a API nunca retorna preço de catálogo aqui). |
| `total_performance.refunds/refunded_items/refund_customers` | Garantido | Existe justamente para não confundir GMV bruto com resultado líquido — o painel nunca apresenta GMV como lucro. |
| `total_performance.gmv_incl_tax/tax/shipping_fees` | Garantido, mas **só em moeda local** (a doc marca "This field only returns the local currency") | Não usado no painel nesta etapa (evita confundir com o `currency` pedido, que pode ser USD). |
| `total_performance.gross_merchandise_value` | Garantido, mas **redundante com `gmv`** (mesmo valor no Response Sample oficial) | Não duplicado na UI. |
| `seller_live_performance` / `seller_video_performance` / `seller_product_card_performance` / `affiliate_total_performance` / `affiliate_live_performance` / `affiliate_video_performance` | **Opcionais** — cada bloco só aparece se o produto teve atividade naquele canal | Nomes do campo "gmv atribuído" mudam por canal: `attributed_gmv` (4 primeiros), `live_attributed_gmv` (affiliate live), `attributed_video_gmv` (affiliate video) — nunca tratados como o mesmo campo. `attributed_orders`/`attributed_sku_orders`/`attributed_sold_items` só existem nos 4 primeiros canais, não nos dois de afiliado com "live/video" no nome. |
| `shop_tab_performance` | Opcional | Forma própria, sem conceito de "atribuído" (`shop_tab_product_impressions`, `shop_tab_ctr`, `shop_tab_gmv`, `shop_tab_sold_items`...). |

## Consequência para o parser e a UI

- Todo campo "Opcional/condicional" acima é lido com `isRecord`/`typeof`
  e vira `null` (nunca um valor inventado) quando ausente — ver
  `lib/tiktok/shop-analytics.ts`.
- A UI nunca soma `gmv` de vídeo com `gmv` de produto (funis diferentes,
  podem contar o mesmo pedido de formas diferentes) nem apresenta
  `total_performance.gmv` como lucro — refunds/tax existem exatamente pra
  isso.
- Blocos de canal ausentes (`seller_live_performance` etc.) são omitidos
  da UI, nunca mostrados como zero.
