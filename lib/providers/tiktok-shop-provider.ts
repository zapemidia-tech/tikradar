import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProductDataProvider } from './product-data-provider';
import type { Creator, Live, OpportunityFactorSummary, Product, Shop, Video } from '@/types';
import { TikTokConfigError } from '@/lib/tiktok/errors';
import { groupSnapshotsByEntity, growthBetween, type EntitySnapshotGroup } from '@/lib/tiktok/snapshot-reduce';
import { calculateRankingVelocity, calculateMomentum, type RankedSnapshot } from '@/lib/scoring/snapshot-analytics';
import { calculateRealOpportunityScore } from '@/lib/scoring/real-opportunity-score';
import { classifySaturation } from '@/lib/scoring/saturation-score';
import { classifyOpportunity } from '@/lib/scoring/opportunity-score';

// Provider que lê os dados REAIS sincronizados da TikTok Shop no Supabase
// (products/creators/videos/lives + *_snapshots). Não chama a API da TikTok
// por requisição — quem faz isso é o serviço de sincronização
// (services/tiktok/*), disparado pelo botão "Sincronizar agora" ou por job.
//
// Regra central: nunca inventa um indicador. Quando um campo não foi
// sincronizado (ex.: comissão) o valor fica `null` e a UI mostra "Não
// informado"; quando o campo depende de histórico que ainda não existe
// (crescimento, velocidade de ranking, momentum, Opportunity Score) o valor
// também fica `null`, mas a UI mostra "Dados insuficientes" — são coisas
// diferentes (ver lib/format.ts).
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
  likes: number | null;
  comments: number | null;
  shares: number | null;
  durationSeconds: number | null;
  publishTime: string | null;
  engagementRate: number | null;
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
    const [{ data: products, error: productsError }, { data: snapshots, error: snapshotsError }, { data: shops, error: shopsError }] = await Promise.all([
      this.client.from('products').select('id,name,shop_id,image_url'),
      this.client
        .from('product_snapshots')
        .select('product_id,captured_at,ranking,sold_count,gmv_estimated,price,creator_count,video_count,review_count,rating')
        .eq('period', SNAPSHOT_PERIOD)
        .order('captured_at', { ascending: false })
        .limit(SNAPSHOT_ROW_LIMIT),
      this.client.from('shops').select('id,name'),
    ]);
    if (productsError) throw productsError;
    if (snapshotsError) throw snapshotsError;
    if (shopsError) throw shopsError;

    const shopNameById = new Map((shops ?? []).map((s) => [s.id as string, s.name as string]));

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
      const shopName = p.shop_id ? (shopNameById.get(p.shop_id as string) ?? null) : null;
      result.push(this.mapProduct(p.id as string, p.name as string, shopName, (p.image_url as string | null) ?? undefined, group));
    }
    return result;
  }

  private mapProduct(id: string, name: string, shopName: string | null, imageUrl: string | undefined, group: EntitySnapshotGroup<ProductSnapshotRow>): Product {
    const { latest, previous, series } = group;
    const growth7d = growthBetween(latest.soldCount, previous?.soldCount ?? null);
    const gmvGrowth7d = growthBetween(latest.gmvEstimated, previous?.gmvEstimated ?? null);
    const rankedSeries: RankedSnapshot[] = series.map((s) => ({ capturedAt: s.capturedAt, ranking: s.ranking }));
    const hasVelocity = series.length >= 2;
    const rankingVelocity = hasVelocity ? Math.round(calculateRankingVelocity(rankedSeries) * 10) / 10 : null;
    const momentum = hasVelocity ? Math.round(calculateMomentum(rankedSeries) * 10) / 10 : null;

    const opportunity = calculateRealOpportunityScore({
      gmvGrowth7d,
      rankingVelocity,
      gmvVolume: latest.gmvEstimated,
      creatorsCount: latest.creatorCount,
      videosCount: latest.videoCount,
      rating: latest.rating,
      momentum,
    });
    const opportunityFactors: OpportunityFactorSummary[] = (opportunity?.factors ?? []).map((f) => ({
      label: f.label,
      weight: f.weight,
      normalizedValue: f.normalizedValue,
    }));

    return {
      id,
      name,
      shop: shopName,
      // category_id não é preenchido pela sincronização atual (a resposta
      // Bestsellers de produtos não retorna categoria).
      category: null,
      imageUrl,
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
      commission: null, // nenhuma API autorizada configurada neste projeto fornece comissão (ver README)
      rating: latest.rating,
      reviews: latest.reviewCount,
      opportunityScore: opportunity?.score ?? null,
      opportunityFactors,
      saturation: opportunity?.saturationScore != null ? classifySaturation(opportunity.saturationScore) : null,
      status: opportunity ? classifyOpportunity(opportunity.score) : null,
      rankingVelocity,
      momentum,
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
        followers: (c.followers as number | null) ?? null,
        sales: latest.sales,
        gmv: latest.gmvEstimated,
        products: null, // creator_snapshots não relaciona produtos promovidos
        videos: latest.videoCount,
        views: null, // não retornado pela API para criadores
        engagement: null, // não retornado pela API para criadores
        // creator_snapshots não tem um campo de vendas real (a API não
        // retorna isso para criadores) — o crescimento usa GMV, o sinal
        // real disponível.
        growth: growthBetween(latest.gmvEstimated, previous?.gmvEstimated ?? null),
      });
    }
    return result;
  }

  // --- Lojas: entidade populada a partir de shop_id/shop_name reais de
  // produtos sincronizados (ver sync-repository). Sem métricas próprias
  // sincronizadas ainda (vendas/GMV/criadores por loja) — por isso a lista
  // fica vazia até esse dado existir, em vez de mostrar números fabricados.
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
        .select('video_id,captured_at,ranking,views,sales,gmv_estimated,likes,comments,shares,duration_seconds,publish_time,engagement_rate')
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
      likes: s.likes,
      comments: s.comments,
      shares: s.shares,
      durationSeconds: s.duration_seconds,
      publishTime: s.publish_time,
      engagementRate: s.engagement_rate,
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
        likes: latest.likes,
        comments: latest.comments,
        shares: latest.shares,
        sales: latest.sales, // API Bestsellers de vídeos não retorna vendas/pedidos — fica sempre null
        gmv: latest.gmvEstimated,
        date: latest.publishTime ?? (v.posted_at as string | null) ?? null,
        // "Vendas atribuídas" não existe na fonte (ver README), então o
        // crescimento do vídeo usa visualizações — o sinal real disponível.
        growth: growthBetween(latest.views, previous?.views ?? null),
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
