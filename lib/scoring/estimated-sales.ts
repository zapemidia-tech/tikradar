// "Vendas estimadas" = uma ESTIMATIVA derivada, nunca um dado oficial da
// TikTok Shop. A resposta real da API (ver services/tiktok/adapters.ts) não
// traz quantidade vendida (`sold_count`/`units_sold`) para os produtos desta
// conta sincronizada — quando isso falta mas GMV e preço existem no MESMO
// snapshot (mesmo período, mesma coleta), aproximamos a quantidade
// dividindo o GMV pelo preço atual.
//
// Fórmula: vendasEstimadas = GMV ÷ preço (arredondado para unidade inteira).
//
// Limitações (documentadas aqui e expostas na UI via tooltip — nunca
// escondidas):
// 1. O preço pode ter mudado dentro da janela do GMV (7D): usamos o preço
//    mais recente do snapshot, não um preço médio do período.
// 2. O próprio GMV já é uma estimativa: a TikTok retorna uma FAIXA
//    (`gmv_range`, ex. "BRL100~BRL200"), e usamos o ponto médio
//    (`gmvEstimated`) — nunca um valor exato (`GmvRange.isExact` é sempre
//    `false`, ver lib/tiktok/types.ts).
// 3. Não soma pedidos com frete/descontos/impostos — é uma aproximação
//    grosseira de quantidade, não uma reconciliação financeira.
//
// Por isso este valor NUNCA é rotulado como "vendas" puro na interface —
// sempre como "vendas estimadas" — e nunca substitui um `soldCount` real
// quando a API passar a fornecê-lo.
export function calculateEstimatedSales(gmv: number | null, price: number | null): number | null {
  if (gmv === null || price === null || !Number.isFinite(gmv) || !Number.isFinite(price) || price <= 0) return null;
  return Math.round(gmv / price);
}
