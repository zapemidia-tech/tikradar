export type SaturationLevel = 'Muito baixa' | 'Baixa' | 'Média' | 'Alta' | 'Muito alta';

// Campos marcados como `number|null` (ou `string|null`) podem genuinamente
// não existir na fonte de dados real (ex.: TikTok Shop não retornou o campo,
// ou ele depende de um histórico de snapshots que ainda não existe). `null`
// significa "consultamos e não há valor" — a UI deve mostrar "Não informado"
// em vez de inventar um número. Isso é diferente de `undefined`/opcional
// (`originalPrice?`), que significa "não se aplica" (ex.: sem desconto).
export interface OpportunityFactorSummary {
  label: string;
  weight: number;
  normalizedValue: number;
}

export interface Product {
  id: string;
  name: string;
  shop: string | null;
  category: string | null;
  imageUrl?: string;
  // URL real da página do produto na TikTok Shop (para a miniatura virar um
  // link de verdade). Só existe quando um campo genuíno de link vier da API
  // — nenhuma resposta real inspeciona até agora traz isso (ver
  // services/tiktok/adapters.ts). NUNCA construir esta URL a partir de `id`;
  // sem URL real, a miniatura fica estática (sem link inventado).
  productUrl?: string;
  price: number | null;
  originalPrice?: number;
  sales24h: number | null;
  sales7d: number | null;
  gmv: number | null;
  // Estimativa (NUNCA um dado oficial): GMV ÷ preço, no mesmo snapshot. Ver
  // fórmula e limitações completas em lib/scoring/estimated-sales.ts.
  // `null` quando falta preço ou GMV reais nesse snapshot — a UI mostra
  // "Não informado", nunca inventa um número.
  estimatedSales: number | null;
  growth24h: number | null;
  growth7d: number | null;
  growth30d: number | null;
  creators: number | null;
  newCreators: number | null;
  videos: number | null;
  newVideos: number | null;
  views: number | null;
  commission: number | null;
  rating: number | null;
  reviews: number | null;
  opportunityScore: number | null;
  /** Fatores reais que formaram o score, para explicar na interface. `null`/vazio quando o score também é `null`. */
  opportunityFactors: OpportunityFactorSummary[];
  saturation: SaturationLevel | null;
  status: string | null;
  rankingVelocity: number | null;
  momentum: number | null;
  trend: string | null;
  rankingHistory: { date: string; ranking: number }[];
  history: { date: string; sales: number | null; gmv: number | null; creators: number | null; videos: number | null }[];
}

/** Período de um snapshot Bestsellers — só existem os períodos que este projeto
 * já sincronizou de fato (ver TOOLTIP_PERIOD_NOT_SYNCED em lib/format.ts). */
export type SnapshotPeriod = '1D' | '7D' | '30D';

export interface Creator {
  id: string;
  name: string;
  username: string | null;
  // Foto de perfil real da TikTok Shop — só existe quando a resposta
  // Bestsellers de criadores retornar um campo de imagem (ver `avatarUrlFrom`
  // em services/tiktok/adapters.ts). Inspecionando o raw_payload real de
  // 500 creator_snapshots em 2026-09-12, os únicos campos vistos são `rank,
  // open_id, gmv_range, nick_name, user_name, likes_count, followers_count`
  // — nenhuma foto. Fica pronto para quando a API passar a retornar isso;
  // até lá, a UI mostra um avatar neutro com iniciais (nunca uma foto
  // inventada ou de outro criador).
  imageUrl?: string;
  // Posição no ranking Bestsellers do período consultado (`period` abaixo).
  // `null` só se, por algum motivo, o snapshot mais recente não tiver
  // ranking gravado — não deveria acontecer na prática (a coluna é NOT NULL),
  // mas o tipo reflete a mesma cautela do resto do app.
  ranking: number | null;
  // Período do snapshot mostrado (1D/7D/30D). `null` só na ausência de
  // qualquer snapshot para o período pedido.
  period: SnapshotPeriod | null;
  followers: number | null;
  sales: number | null;
  // Ponto médio da faixa de GMV (gmvRangeMin+gmvRangeMax)/2 — só para ordenar
  // e calcular crescimento. Nunca exibir como se fosse um valor exato: use
  // gmvRangeMin/gmvRangeMax para mostrar a faixa real recebida da TikTok.
  gmv: number | null;
  gmvRangeMin: number | null;
  gmvRangeMax: number | null;
  // Sempre `null` hoje: nenhum payload real (produtos, criadores, vídeos ou
  // lives) traz uma relação verificável entre creator_id e product_id — ver
  // TikTokShopProvider.getCreators para os detalhes da investigação. Nunca
  // associar por nome parecido/suposição; se um endpoint futuro trouxer essa
  // relação, preencher aqui a contagem de produtos distintos.
  products: number | null;
  videos: number | null;
  views: number | null;
  engagement: number | null;
  growth: number | null;
}

export interface Shop {
  id: string;
  name: string;
  category: string;
  activeProducts: number;
  sales: number;
  gmv: number;
  growth: number;
  rating: number;
  creators: number;
}

export interface Video {
  id: string;
  creator: string | null;
  product: string | null;
  // Miniatura e link do produto associado ao vídeo (vêm de `products`,
  // via `product_id`, quando o produto já faz parte do catálogo
  // sincronizado). `productUrl` só existe quando a API retornar um campo
  // real de link — ver comentário em `Product.productUrl`.
  imageUrl?: string;
  productUrl?: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  sales: number | null;
  gmv: number | null;
  date: string | null;
  growth: number | null;
  url?: string;
}

// TikTok Shop Lives: só temos ranking e uma faixa/estimativa de GMV por
// snapshot — sem página própria ainda, exposto no Dashboard.
export interface Live {
  id: string;
  name: string;
  gmv: number | null;
  ranking: number | null;
}

/** Ver lib/scoring/new-in-radar.ts para os critérios e limites exatos. */
export type GmvTierId = 1 | 2 | 3 | 4;

// "Novos no radar": produtos cuja primeira captura real (por product_id, em
// todo o histórico de product_snapshots) ocorreu nos últimos 7 dias e cujo
// GMV 7D (limite inferior da faixa que a TikTok retorna) é de pelo menos
// R$ 10 mil. `firstDetectedAt` NUNCA é "data de lançamento"/"cadastro na
// TikTok" — é só o momento em que o TikRadar viu o produto pela 1ª vez; ele
// pode existir há mais tempo. Só entram produtos cujo GMV foi validado como
// 7D/BRL/faixa consistente (ver checkGmvReliability) — os demais são
// excluídos e o motivo fica só nos logs do servidor (nunca no cliente).
export interface NewInRadarProduct {
  id: string;
  name: string;
  shop: string | null;
  imageUrl?: string;
  // Mesma regra de products.productUrl: só existe quando a API retornar um
  // campo real de link — nunca construída a partir do id.
  productUrl?: string;
  // Faixa ORIGINAL de GMV 7D em BRL, como a TikTok retornou — nunca o ponto
  // médio (gmv_estimated) apresentado como se fosse um valor exato.
  gmvRangeMin: number;
  gmvRangeMax: number;
  gmvTier: GmvTierId;
  firstDetectedAt: string;
  ranking: number;
  // Campos que a resposta real de products/bestselling NUNCA retornou até
  // agora nesta conta (ver README) — ficam aqui, sempre `null` hoje, só
  // para a UI poder mostrar "Não informado" explicitamente em vez de
  // omitir o campo (nunca tratar ausência como zero/confirmado).
  price: number | null;
  soldCount: number | null;
  commission: number | null;
  creators: number | null;
  // Evolução real entre os dois snapshots 7D mais recentes deste produto.
  // `null` em qualquer um dos três campos abaixo = histórico insuficiente
  // (só existe 1 snapshot ainda) — nunca um crescimento inventado.
  previousRanking: number | null;
  gmvGrowthPct: number | null;
  // true só quando há 2+ snapshots comparáveis E (ranking melhorou OU GMV
  // cresceu) — nunca com base só na 1ª detecção.
  hasConfirmedGrowth: boolean;
  snapshotsCount: number;
}
