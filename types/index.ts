export type SaturationLevel = 'Muito baixa' | 'Baixa' | 'Média' | 'Alta' | 'Muito alta';

// Campos marcados como `number|null` (ou `string|null`) podem genuinamente
// não existir na fonte de dados real (ex.: TikTok Shop não retornou o campo,
// ou ele depende de um histórico de snapshots que ainda não existe). `null`
// significa "consultamos e não há valor" — a UI deve mostrar "Não informado"
// em vez de inventar um número. Isso é diferente de `undefined`/opcional
// (`originalPrice?`), que significa "não se aplica" (ex.: sem desconto).
export interface Product {
  id: string;
  name: string;
  shop: string | null;
  category: string | null;
  price: number | null;
  originalPrice?: number;
  sales24h: number | null;
  sales7d: number | null;
  gmv: number | null;
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
  saturation: SaturationLevel | null;
  status: string | null;
  rankingVelocity: number | null;
  momentum: number | null;
  trend: string | null;
  rankingHistory: { date: string; ranking: number }[];
  history: { date: string; sales: number | null; gmv: number | null; creators: number | null; videos: number | null }[];
}

export interface Creator {
  id: string;
  name: string;
  username: string | null;
  followers: number | null;
  sales: number | null;
  gmv: number | null;
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
