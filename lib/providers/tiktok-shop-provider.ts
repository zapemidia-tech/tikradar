import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProductDataProvider } from './product-data-provider';
import type { Creator, Live, NewInRadarProduct, OpportunityFactorSummary, Product, Shop, SnapshotPeriod, Video } from '@/types';
import { TikTokConfigError } from '@/lib/tiktok/errors';
import { groupSnapshotsByEntity, growthBetween, type EntitySnapshotGroup } from '@/lib/tiktok/snapshot-reduce';
import { calculateRankingVelocity, calculateMomentum, type RankedSnapshot } from '@/lib/scoring/snapshot-analytics';
import { calculateRealOpportunityScore } from '@/lib/scoring/real-opportunity-score';
import { classifySaturation } from '@/lib/scoring/saturation-score';
import { classifyOpportunity } from '@/lib/scoring/opportunity-score';
import { calculateEstimatedSales } from '@/lib/scoring/estimated-sales';
import { checkGmvReliability, classifyGmvTier, isWithinLastDays } from '@/lib/scoring/new-in-radar';

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
  period: string;
  sales: number | null;
  gmvMin: number | null;
  gmvMax: number | null;
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

// "Novos no radar" precisa do raw_payload (para confirmar período/moeda via
// checkGmvReliability) e de gmv_min/gmv_max (a faixa ORIGINAL — nunca só o
// ponto médio) além do que as outras leituras de produto já usam.
type NewInRadarSnapshotRow = {
  capturedAt: string;
  ranking: number;
  period: string;
  gmvMin: number | null;
  gmvMax: number | null;
  gmvEstimated: number | null;
  price: number | null;
  soldCount: number | null;
  creatorCount: number | null;
  rawPayload: unknown;
};

const NEW_IN_RADAR_WINDOW_DAYS = 7;

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
      this.client.from('products').select('id,name,shop_id,image_url,product_url'),
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
      result.push(
        this.mapProduct(
          p.id as string,
          p.name as string,
          shopName,
          (p.image_url as string | null) ?? undefined,
          (p.product_url as string | null) ?? undefined,
          group,
        ),
      );
    }
    return result;
  }

  private mapProduct(
    id: string,
    name: string,
    shopName: string | null,
    imageUrl: string | undefined,
    productUrl: string | undefined,
    group: EntitySnapshotGroup<ProductSnapshotRow>,
  ): Product {
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
      productUrl,
      price: latest.price,
      originalPrice: undefined,
      sales24h: null, // não sincronizamos o período '1D'
      sales7d: latest.soldCount,
      gmv: latest.gmvEstimated,
      // Estimativa (GMV ÷ preço no mesmo snapshot) — ver
      // lib/scoring/estimated-sales.ts para a fórmula e limitações. Hoje
      // fica sempre `null` porque a API não retorna preço para nenhum
      // produto sincronizado; ativa sozinha quando price passar a existir.
      estimatedSales: calculateEstimatedSales(latest.gmvEstimated, latest.price),
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
  // `period` seleciona qual snapshot Bestsellers mostrar (1D/7D/30D — mesmos
  // períodos que `time_slot` aceita na API real, ver services/tiktok/
  // bestsellers-service.ts). Hoje só o período '7D' foi de fato sincronizado
  // nesta conta (confirmado consultando creator_snapshots em produção,
  // 2026-09-12: 100% das linhas têm period='7D') — pedir '1D'/'30D' devolve
  // uma lista vazia até uma sincronização futura capturar esses períodos; a
  // UI (`/creators`) mostra isso explicitamente, nunca como um erro.
  //
  // Relação criador↔produto: investigado nos payloads reais de creators
  // (rank, open_id, gmv_range, nick_name, user_name, likes_count,
  // followers_count), products (id, name, rank, rating, shop_id, shop_name,
  // gmv_range, product_image), videos (id, rank, likes, views, shares,
  // comments, duration, gmv_range, nick_name, publish_time, product_infos[])
  // e lives (id, rank, title, open_id, duration, gmv_range, start_time,
  // creator_name, creator_nick_name) — nenhum deles carrega um ID em comum
  // entre criador e produto. `product_infos` de vídeos só tem product_id
  // (sem creator_id no mesmo item); `creator_name`/`creator_nick_name` de
  // lives são texto livre, sem ID. Por isso `products` abaixo é sempre
  // `null`: nunca inferimos essa contagem por nome parecido.
  async getCreators(period: SnapshotPeriod = SNAPSHOT_PERIOD): Promise<Creator[]> {
    const [{ data: creators, error: creatorsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
      this.client.from('creators').select('id,name,username,followers,avatar_url'),
      this.client
        .from('creator_snapshots')
        .select('creator_id,captured_at,ranking,period,sales,gmv_min,gmv_max,gmv_estimated,video_count')
        .eq('period', period)
        .order('captured_at', { ascending: false })
        .limit(SNAPSHOT_ROW_LIMIT),
    ]);
    if (creatorsError) throw creatorsError;
    if (snapshotsError) throw snapshotsError;

    const rows: (CreatorSnapshotRow & { creatorId: string })[] = (snapshots ?? []).map((s) => ({
      creatorId: s.creator_id as string,
      capturedAt: s.captured_at as string,
      ranking: s.ranking as number,
      period: s.period as string,
      sales: s.sales,
      gmvMin: s.gmv_min,
      gmvMax: s.gmv_max,
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
        // Ver Creator.imageUrl em types/index.ts: hoje sempre undefined
        // nesta conta (nenhum raw_payload de criador traz foto), pronto para
        // quando a coluna passar a ser preenchida por uma sincronização real.
        imageUrl: (c.avatar_url as string | null) ?? undefined,
        ranking: latest.ranking,
        period: latest.period as SnapshotPeriod,
        followers: (c.followers as number | null) ?? null,
        sales: latest.sales,
        gmv: latest.gmvEstimated,
        gmvRangeMin: latest.gmvMin,
        gmvRangeMax: latest.gmvMax,
        products: null, // ver investigação de relação criador↔produto acima — nenhuma existe nos payloads reais
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
      this.client.from('products').select('id,name,image_url,product_url'),
    ]);
    if (videosError) throw videosError;
    if (snapshotsError) throw snapshotsError;
    if (creatorsError) throw creatorsError;
    if (productsError) throw productsError;

    const creatorNameById = new Map((creators ?? []).map((c) => [c.id as string, c.name as string]));
    const productNameById = new Map((products ?? []).map((p) => [p.id as string, p.name as string]));
    // Miniatura/link do produto vinculado ao vídeo: reaproveita o que já foi
    // sincronizado em `products` (image_url real; product_url continua
    // sempre ausente hoje — ver services/tiktok/adapters.ts). Só existe
    // quando o vídeo já está associado a um produto do catálogo.
    const productImageById = new Map((products ?? []).map((p) => [p.id as string, (p.image_url as string | null) ?? undefined]));
    const productUrlById = new Map((products ?? []).map((p) => [p.id as string, (p.product_url as string | null) ?? undefined]));

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
        imageUrl: v.product_id ? productImageById.get(v.product_id as string) : undefined,
        productUrl: v.product_id ? productUrlById.get(v.product_id as string) : undefined,
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

  // --- Novos no radar --------------------------------------------------
  // Critério de entrada: 1) `products.created_at` (= o instante da 1ª linha
  // gravada para este product_id — confirmado em 2026-09-12 comparando com
  // min(product_snapshots.captured_at) em produção; ver
  // supabase/migrations/007_new_in_radar_indexes.sql) caiu nos últimos 7
  // dias; 2) o GMV 7D (limite inferior da faixa) do snapshot mais recente é
  // de pelo menos R$ 10 mil E passa em `checkGmvReliability` (período 7D,
  // moeda BRL, faixa consistente com o raw_payload bruto). Produto que não
  // passa nesses critérios simplesmente não aparece — nunca aparece com um
  // valor inventado.
  async getNewInRadar(): Promise<NewInRadarProduct[]> {
    // Um único `now` para o filtro no Supabase e para a re-checagem em
    // isWithinLastDays logo abaixo — evita qualquer drift de poucos ms entre
    // os dois (o filtro no banco é só uma otimização; isWithinLastDays,
    // testada em tests/new-in-radar.test.ts, é a regra que vale de fato).
    const now = new Date();
    const cutoffIso = new Date(now.getTime() - NEW_IN_RADAR_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Filtra por `created_at` no próprio Supabase (índice em
    // products_created_at_idx) — nunca traz todo o catálogo para filtrar em
    // memória. Normalmente são poucos produtos (só os detectados na última
    // semana), então as consultas seguintes ficam pequenas por construção.
    const { data: candidates, error: candidatesError } = await this.client
      .from('products')
      .select('id,name,shop_id,image_url,product_url,created_at')
      .gte('created_at', cutoffIso);
    if (candidatesError) throw candidatesError;
    if (!candidates || candidates.length === 0) return [];

    const productIds = candidates.map((p) => p.id as string);
    const shopIds = [...new Set(candidates.map((p) => p.shop_id as string | null).filter((id): id is string => Boolean(id)))];

    const [{ data: snapshots, error: snapshotsError }, { data: shops, error: shopsError }] = await Promise.all([
      this.client
        .from('product_snapshots')
        .select('product_id,captured_at,ranking,period,gmv_min,gmv_max,gmv_estimated,price,sold_count,creator_count,raw_payload')
        .in('product_id', productIds)
        .eq('period', SNAPSHOT_PERIOD)
        .order('captured_at', { ascending: false })
        .limit(SNAPSHOT_ROW_LIMIT),
      shopIds.length ? this.client.from('shops').select('id,name').in('id', shopIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (snapshotsError) throw snapshotsError;
    if (shopsError) throw shopsError;

    const shopNameById = new Map((shops ?? []).map((s) => [s.id as string, s.name as string]));

    const rows: (NewInRadarSnapshotRow & { productId: string })[] = (snapshots ?? []).map((s) => ({
      productId: s.product_id as string,
      capturedAt: s.captured_at as string,
      ranking: s.ranking as number,
      period: s.period as string,
      gmvMin: s.gmv_min,
      gmvMax: s.gmv_max,
      gmvEstimated: s.gmv_estimated,
      price: s.price,
      soldCount: s.sold_count,
      creatorCount: s.creator_count,
      rawPayload: s.raw_payload,
    }));
    const grouped = groupSnapshotsByEntity(rows, (r) => r.productId);

    const result: NewInRadarProduct[] = [];
    for (const p of candidates) {
      const id = p.id as string;
      const createdAt = p.created_at as string;
      // Critério 1: detectado nos últimos 7 dias (por milissegundos reais,
      // não por corte de calendário — ver isWithinLastDays).
      if (!isWithinLastDays(createdAt, NEW_IN_RADAR_WINDOW_DAYS, now)) continue;

      const group = grouped.get(id);
      if (!group) continue; // produto sem snapshot 7D ainda: nada real a mostrar
      const { latest, previous, series } = group;

      const reliability = checkGmvReliability({ period: latest.period, rawPayload: latest.rawPayload, gmvMin: latest.gmvMin, gmvMax: latest.gmvMax });
      if (!reliability.ok) {
        // Diagnóstico só no servidor — nunca expõe raw_payload ao cliente.
        console.error(`[new-in-radar] produto ${id} excluído: ${reliability.reason}`);
        continue;
      }

      // Critério 2: GMV 7D (limite inferior) de pelo menos R$ 10 mil.
      const tier = classifyGmvTier(latest.gmvMin);
      if (tier === null) continue;

      const hasComparableHistory = previous !== null && series.length >= 2;
      const rankingImproved = hasComparableHistory && previous !== null && latest.ranking < previous.ranking;
      const gmvGrowthPct = hasComparableHistory ? growthBetween(latest.gmvEstimated, previous?.gmvEstimated ?? null) : null;
      const gmvIncreased = gmvGrowthPct !== null && gmvGrowthPct > 0;

      result.push({
        id,
        name: p.name as string,
        shop: p.shop_id ? (shopNameById.get(p.shop_id as string) ?? null) : null,
        imageUrl: (p.image_url as string | null) ?? undefined,
        productUrl: (p.product_url as string | null) ?? undefined,
        gmvRangeMin: latest.gmvMin as number,
        gmvRangeMax: latest.gmvMax as number,
        gmvTier: tier,
        firstDetectedAt: createdAt,
        ranking: latest.ranking,
        price: latest.price, // sempre null nesta conta hoje — API não retorna preço no payload de bestselling (ver README)
        soldCount: latest.soldCount, // idem — API não retorna quantidade vendida
        commission: null, // nenhum endpoint autorizado neste projeto fornece comissão (ver README)
        creators: latest.creatorCount, // idem price/soldCount
        previousRanking: hasComparableHistory ? (previous?.ranking ?? null) : null,
        gmvGrowthPct,
        hasConfirmedGrowth: hasComparableHistory && (rankingImproved || gmvIncreased),
        snapshotsCount: series.length,
      });
    }
    return result;
  }
}

/** Chave de dia (YYYY-MM-DD) a partir de um timestamp de captura — ordenável
 * como string e formatada para exibição só na borda (UI), não aqui. */
function dayKey(capturedAt: string): string {
  return capturedAt.slice(0, 10);
}
