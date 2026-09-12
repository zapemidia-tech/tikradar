import type { TikTokShopClient } from '@/lib/tiktok/client';
import type { BestsellersKind, BestsellersQuery, TikTokApiEnvelope } from '@/lib/tiktok/types';
import { computeReferenceDate, timeZoneForRegion, withDateFallback } from '@/lib/tiktok/reference-date';

const paths: Record<BestsellersKind, string> = {
  products: '/analytics/202511/products/bestselling',
  creators: '/analytics/202511/creators/bestselling',
  videos: '/analytics/202511/videos/bestselling',
  lives: '/analytics/202511/lives/bestselling',
};

// A TikTok tem atraso no processamento: pedir o dia anterior pode falhar
// ("date must be on or before ..."). Por isso a data de referência começa
// em 2 dias atrás (no fuso da região da loja, não em UTC do servidor) e,
// se a TikTok indicar uma data máxima diferente, a chamada é refeita UMA
// única vez com essa data — ver lib/tiktok/reference-date.ts, usado aqui
// para os 4 tipos (produtos/criadores/vídeos/lives) da mesma forma.
const REFERENCE_DAYS_AGO = 2;

export interface BestsellersResult {
  envelope: TikTokApiEnvelope<unknown>;
  /** Data de referência (`YYYY-MM-DD`) efetivamente aceita pela TikTok nesta chamada. */
  dateUsed: string;
}

export class BestsellersService {
  constructor(
    private readonly client: TikTokShopClient,
    private readonly region?: string,
  ) {}

  private async get(kind: BestsellersKind, q: BestsellersQuery = {}): Promise<BestsellersResult> {
    const initialDate = q.date ?? computeReferenceDate(new Date(), timeZoneForRegion(this.region), REFERENCE_DAYS_AGO);
    const { result, dateUsed } = await withDateFallback(initialDate, (date) =>
      this.client.request(paths[kind], {
        time_slot: q.period ?? '7D',
        currency: q.currency ?? 'LOCAL',
        date,
        category_id: q.categoryId,
        ...(kind === 'creators' ? { author_type: 'ALL' } : {}),
      }),
    );
    return { envelope: result, dateUsed };
  }

  getBestsellingProducts(q?: BestsellersQuery) {
    return this.get('products', q);
  }
  getBestsellingCreators(q?: BestsellersQuery) {
    return this.get('creators', q);
  }
  getBestsellingVideos(q?: BestsellersQuery) {
    return this.get('videos', q);
  }
  getBestsellingLives(q?: BestsellersQuery) {
    return this.get('lives', q);
  }
}
