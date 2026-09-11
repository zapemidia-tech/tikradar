import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProductDataProvider } from './product-data-provider';
import type { Creator, Live, Product, Shop, Video } from '@/types';
import { TikTokConfigError } from '@/lib/tiktok/errors';
import { groupSnapshotsByEntity, growthBetween, type EntitySnapshotGroup } from '@/lib/tiktok/snapshot-reduce';
import { calculateRankingVelocity, calculateMomentum, type RankedSnapshot } from '@/lib/scoring/snapshot-analytics';

// Provider que lê os dados REAIS sincronizados da TikTok Shop no Supabase
// (products/creators/videos/lives + *_snapshots). Não chama a API da TikTok
// por requisição — quem faz isso é o serviço de sincronização
// (services/tiktok/*), disparado pelo botão "Sincronizar agora" ou por job.
//
// Regra central: nunca inventa um indicador. Quando um campo não foi
// sincronizado (ex.: comissão, engajamento) ou depende de um histórico que
// ainda não existe (ex.: crescimento com um único snapshot), o valor fica
// `null` e a UI mostra "Não informado".
//
// Hoje só sincronizamos o período '7D' (padrão de `syncAll`), então:
// - `growth7d` é real: variação do valor entre os dois snapshots 7D mais
//   recentes de cada entidade.
// - `growth24h`/`growth30d` ficam `null` até existir sincronização nos
//   períodos '1D'/'30D'.
const SNAPSHOT_PERIOD = '7D';
const SNAPSHOT_ROW_LIMIT = 4000;

type ProductSnapshotRow = {
  capturedAt: string;
  ranking: number;
  soldCount: number | null;
  gmvEstimated: number | null;
  price: number | null;
  creatorCount: number | null;
  videoCount: number | null;
  reviewCount: number | null;
  rating: number | null;
};

type CreatorSnapshotRow = {
  capturedAt: string;
  ranking: number;
  sales: number | null;
  gmvEstimated: number | null;
  videoCount: number | null;
};

type VideoSnapshotRow = {
  capturedAt: string;
  ranking: number;
  views: number | null;
  sales: number | null;
  gmvEstimated: number | null;
};

type LiveSnapshotRow = {
  capturedAt: string;
  ranking: number;
  gmvEstimated: number | null;
};

export class TikTokShopProvider implements ProductDataProvider {
  private client: SupabaseClient;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new TikTokConfigError('Supabase server-side não configurado.');
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  // --- Produtos -------------------------------------------------------
  async getProducts(): Promise<Product[]> {
    const [{ data: products, error: productsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
      this.client.from('products').select('id,name'),
      this.client
        .from('product_snapshots')
        .select('product_id,captured_at,ranking,sold_count,gmv_estimated,price,creator_count,video_count,review_count,rating')
        .eq('period', SNAPSHOT_PERIOD)
        .order('captured_at', { ascending: false })
        .limit(SNAPSHOT_ROW_LIMIT),
    ]);
    if (productsError) throw productsError;
    if (snapshotsError) throw snapshotsError;

    const rows: (ProductSnapshotRow & { productId: string })[] = (snapshots ?? []).map((s) => ({
      productId: s.product_id as string,
      capturedAt: s.captured_at as string,
      ranking: s.ranking as number,
      soldCount: s.sold_count,
      gmvEstimated: s.gmv_estimated,
      price: s.price,
      creatorCount: s.creator_count,
      videoCount: s.video_count,
      reviewCount: s.review_count,
      rating: s.rating,
    }));
    const grouped = groupSnapshotsByEntity(rows, (r) => r.productId);

    const result: Product[] = [];
    for (const p of products ?? []) {
      const group = grouped.get(p.id as string);
      if (!group) continue; // produto sem snapshot ainda: nada real a mostrar
      result.push(this.mapProduct(p.id as string, p.name as string, group));
    }
    return result;
  }

  private mapProduct(id: string, name: string, group: EntitySnapshotGroup<ProductSnapshotRow>): Product {
    const { latest, previous, series } = group;
    const growth7d = growthBetween(latest.soldCount, previous?.soldCount ?? null);
    const rankedSeries: RankedSnapshot[] = series.map((s) => ({ capturedAt: s.capturedAt, ranking: s.ranking }));
    const hasVelocity = series.length >= 2;

    return {
      id,
      name,
      // shop_id/category_id não são preenchidos pela sincronização atual.
      shop: null,
      category: null,
      price: latest.price,
      originalPrice: undefined,
      sales24h: null, // não sincronizamos o período '1D'
      sales7d: latest.soldCount,
      gmv: latest.gmvEstimated,
      growth24h: null,
      growth7d,
      growth30d: null, // não sincronizamos o período '30D'
      creators: latest.creatorCount,
      newCreators: previous ? Math.max(0, (latest.creatorCount ?? 0) - (previous.creatorCount ?? 0)) : null,
      videos: latest.videoCount,
      newVideos: previous ? Math.max(0, (latest.videoCount ?? 0) - (previous.videoCount ?? 0)) : null,
      views: null, // TikTok Shop não retorna views agregadas por produto
      commission: null, // não sincronizado (produtos.commission nunca é preenchido pelo sync)
      rating: latest.rating,
      reviews: latest.reviewCount,
      // Opportunity Score/Saturação exigem sinais que ainda não sincronizamos
      // (comissão, nº de vendedores) — mostrar um score aqui seria inventar.
      opportunityScore: null,
      saturation: null,
      status: null,
      rankingVelocity: hasVelocity ? Math.round(calculateRankingVelocity(rankedSeries) * 10) / 10 : null,
      momentum: hasVelocity ? Math.round(calculateMomentum(rankedSeries) * 10) / 10 : null,
      trend: growth7d === null ? null : growth7d > 20 ? 'Acelerando' : growth7d < 0 ? 'Em queda' : 'Estável',
      rankingHistory: series.map((s) => ({ date: dayKey(s.capturedAt), ranking: s.ranking })),
      history: series.map((s) => ({
        date: dayKey(s.capturedAt),
        sales: s.soldCount,
        gmv: s.gmvEstimated,
        creators: s.creatorCount,
        videos: s.videoCount,
      })),
    };
  }

  async getProduct(id: string) {
    return (await this.getProducts()).find((p) => p.id === id) ?? null;
  }

  async getProductMetrics(id: string): Promise<Product['history']> {
    return (await this.getProduct(id))?.history ?? [];
  }

  // --- Criadores --------------------------------------------------------
  async getCreators(): Promise<Creator[]> {
    const [{ data: creators, error: creatorsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
      this.client.from('creators').select('id,name,username,followers'),
      this.client
        .from('creator_snapshots')
        .select('creator_id,captured_at,ranking,sales,gmv_estimated,video_count')
        .eq('period', SNAPSHOT_PERIOD)
        .order('captured_at', { ascending: false })
        .limit(SNAPSHOT_ROW_LIMIT),
    ]);
    if (creatorsError) throw creatorsError;
    if (snapshotsError) throw snapshotsError;

    const rows: (CreatorSnapshotRow & { creatorId: string })[] = (snapshots ?? []).map((s) => ({
      creatorId: s.creator_id as string,
      capturedAt: s.captured_at as string,
      ranking: s.ranking as number,
      sales: s.sales,
      gmvEstimated: s.gmv_estimated,
      videoCount: s.video_count,
    }));
    const grouped = groupSnapshotsByEntity(rows, (r) => r.creatorId);

    const result: Creator[] = [];
    for (const c of creators ?? []) {
      const group = grouped.get(c.id as string);
      if (!group) continue;
      const { latest, previous } = group;
      result.push({
        id: c.id as string,
        name: c.name as string,
        username: (c.username as string | null) ?? null,
        followers: (c.followers as number | null) ?? null, // não preenchido pelo sync atual
        sales: latest.sales,
        gmv: latest.gmvEstimated,
        products: null, // creator_snapshots não relaciona produtos promovidos
        videos: latest.videoCount,
        views: null, // não sincronizado
        engagement: null, // não sincronizado
        growth: growthBetween(latest.sales, previous?.sales ?? null),
      });
    }
    return result;
  }

  // --- Lojas: não sincronizadas ainda (sync cobre products/creators/videos/lives) ---
  async getShops(): Promise<Shop[]> {
    return [];
  }

  // --- Vídeos -------------------------------------------------------
  async getVideos(): Promise<Video[]> {
    const [
      { data: videos, error: videosError },
      { data: snapshots, error: snapshotsError },
      { data: creators, error: creatorsError },
      { data: products, error: productsError },
    ] = await Promise.all([
      this.client.from('videos').select('id,creator_id,product_id,url,posted_at'),
      this.client
        .from('video_snapshots')
        .select('video_id,captured_at,ranking,views,sales,gmv_estimated')
        .eq('period', SNAPSHOT_PERIOD)
        .order('captured_at', { ascending: false })
        .limit(SNAPSHOT_ROW_LIMIT),
      this.client.from('creators').select('id,name'),
      this.client.from('products').select('id,name'),
    ]);
    if (videosError) throw videosError;
    if (snapshotsError) throw snapshotsError;
    if (creatorsError) throw creatorsError;
    if (productsError) throw productsError;

    const creatorNameById = new Map((creators ?? []).map((c) => [c.id as string, c.name as string]));
    const productNameById = new Map((products ?? []).map((p) => [p.id as string, p.name as string]));

    const rows: (VideoSnapshotRow & { videoId: string })[] = (snapshots ?? []).map((s) => ({
      videoId: s.video_id as string,
      capturedAt: s.captured_at as string,
      ranking: s.ranking as number,
      views: s.views,
      sales: s.sales,
      gmvEstimated: s.gmv_estimated,
    }));
    const grouped = groupSnapshotsByEntity(rows, (r) => r.videoId);

    const result: Video[] = [];
    for (const v of videos ?? []) {
      const group = grouped.get(v.id as string);
      if (!group) continue;
      const { latest, previous } = group;
      result.push({
        id: v.id as string,
        creator: v.creator_id ? (creatorNameById.get(v.creator_id as string) ?? null) : null,
        product: v.product_id ? (productNameById.get(v.product_id as string) ?? null) : null,
        views: latest.views,
        likes: null, // TikTok Shop Bestsellers não retorna curtidas/comentários/compartilhamentos
        comments: null,
        shares: null,
        sales: latest.sales,
        gmv: latest.gmvEstimated,
        date: (v.posted_at as string | null) ?? null, // não preenchido pelo sync atual
        growth: growthBetween(latest.sales, previous?.sales ?? null),
        url: (v.url as string | null) ?? undefined,
      });
    }
    return result;
  }

  // --- Lives --------------------------------------------------------
  async getLives(): Promise<Live[]> {
    const [{ data: lives, error: livesError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
      this.client.from('lives').select('id,name'),
      this.client
        .from('live_snapshots')
        .select('live_id,captured_at,ranking,gmv_estimated')
        .eq('period', SNAPSHOT_PERIOD)
        .order('captured_at', { ascending: false })
        .limit(SNAPSHOT_ROW_LIMIT),
    ]);
    if (livesError) throw livesError;
    if (snapshotsError) throw snapshotsError;

    const rows: (LiveSnapshotRow & { liveId: string })[] = (snapshots ?? []).map((s) => ({
      liveId: s.live_id as string,
      capturedAt: s.captured_at as string,
      ranking: s.ranking as number,
      gmvEstimated: s.gmv_estimated,
    }));
    const grouped = groupSnapshotsByEntity(rows, (r) => r.liveId);

    const result: Live[] = [];
    for (const l of lives ?? []) {
      const group = grouped.get(l.id as string);
      if (!group) continue;
      result.push({ id: l.id as string, name: l.name as string, gmv: group.latest.gmvEstimated, ranking: group.latest.ranking });
    }
    return result.sort((a, b) => (a.ranking ?? Infinity) - (b.ranking ?? Infinity));
  }
}

/** Chave de dia (YYYY-MM-DD) a partir de um timestamp de captura — ordenável
 * como string e formatada para exibição só na borda (UI), não aqui. */
function dayKey(capturedAt: string): string {
  return capturedAt.slice(0, 10);
}
