import { TikTokSchemaError } from '@/lib/tiktok/errors';
import type { BestsellersKind, NormalizedBestseller, TikTokApiEnvelope, TikTokCurrency } from '@/lib/tiktok/types';

export interface BestsellersAdapter {
  normalize(kind: BestsellersKind, response: TikTokApiEnvelope<unknown>, currency: TikTokCurrency): NormalizedBestseller[];
}

export class UnconfiguredBestsellersAdapter implements BestsellersAdapter {
  normalize(): NormalizedBestseller[] {
    throw new TikTokSchemaError('Adapter Bestsellers ainda não configurado. Capture uma resposta oficial no API Testing Tool e implemente o mapeamento sem inferir campos.');
  }
}

export function normalizeGmvRange(input: { min: unknown; max: unknown; display?: unknown; currency: TikTokCurrency }): import('@/lib/tiktok/types').GmvRange {
  const min = typeof input.min === 'number' && Number.isFinite(input.min) ? input.min : null;
  const max = typeof input.max === 'number' && Number.isFinite(input.max) ? input.max : null;
  const estimated = min !== null && max !== null ? (min + max) / 2 : null;
  const display =
    typeof input.display === 'string' && input.display.trim()
      ? input.display
      : min !== null && max !== null
        ? `${min.toLocaleString('pt-BR')} – ${max.toLocaleString('pt-BR')}`
        : 'Faixa não informada';
  return { gmvMin: min, gmvMax: max, gmvEstimated: estimated, gmvDisplay: display, currency: input.currency, isExact: false };
}

type JsonRecord = Record<string, unknown>;
const records = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter((x): x is JsonRecord => Boolean(x) && typeof x === 'object') : []);
const numberValue = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
const stringValue = (...values: unknown[]) => values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()));

function rangeNumber(value: string) {
  const cleaned = value.replace(/[^0-9.,KMB]/gi, '').replace(',', '.');
  const match = cleaned.match(/([0-9.]+)\s*([KMB])?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return amount * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase() as 'K' | 'M' | 'B'] ?? 1);
}

function gmv(value: unknown, currency: TikTokCurrency) {
  if (typeof value === 'string') {
    const parts = value.split(/\s*[~–—-]\s*/).map(rangeNumber);
    return normalizeGmvRange({ min: parts[0], max: parts[1] ?? parts[0], display: value, currency });
  }
  if (value && typeof value === 'object') {
    const r = value as JsonRecord;
    return normalizeGmvRange({ min: numberValue(r.minimum_amount ?? r.min), max: numberValue(r.maximum_amount ?? r.max), currency, display: r.display });
  }
  return normalizeGmvRange({ min: null, max: null, currency });
}

function collection(data: unknown, kind: BestsellersKind) {
  if (!data || typeof data !== 'object') return [];
  return records((data as JsonRecord)[kind]);
}

/** `product_image.urls[0]` (ou `thumb_urls[0]` como fallback) — visto na resposta real de products/bestselling. */
function imageUrlFrom(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const image = value as JsonRecord;
  const urls = Array.isArray(image.urls) ? image.urls : [];
  const thumbUrls = Array.isArray(image.thumb_urls) ? image.thumb_urls : [];
  return stringValue(urls[0], thumbUrls[0]);
}

/** unix seconds -> ISO 8601, ou undefined se ausente/ inválido. */
function isoFromUnixSeconds(value: unknown): string | undefined {
  const seconds = numberValue(value);
  if (seconds === undefined) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** (likes+comments+shares)/views*100 — só quando views>0 e os três estão presentes (nunca trata ausente como 0). */
function engagementRateFrom(likes: number | undefined, comments: number | undefined, shares: number | undefined, views: number | undefined): number | undefined {
  if (!views || views <= 0) return undefined;
  if (likes === undefined || comments === undefined || shares === undefined) return undefined;
  return Math.round(((likes + comments + shares) / views) * 10000) / 100;
}

export class TikTokBestsellersAdapter implements BestsellersAdapter {
  normalize(kind: BestsellersKind, response: TikTokApiEnvelope<unknown>, currency: TikTokCurrency) {
    return collection(response.data, kind).map((item, index) => {
      const products = records(item.product_infos);
      const firstProduct = products[0];

      const externalId = stringValue(
        item.id,
        item.product_id,
        item.creator_id,
        item.video_id,
        item.live_id,
        item.room_id,
        item.open_id,
        item.username,
        kind === 'videos' ? `video:${item.publish_time ?? index}:${firstProduct?.product_id ?? index}` : undefined,
        kind === 'lives' ? `live:${item.start_time ?? item.publish_time ?? index}` : undefined,
      );
      if (!externalId) throw new TikTokSchemaError(`Resposta Bestsellers sem identificador em ${kind}.`);

      const views = numberValue(item.views ?? item.view_count);
      const likes = numberValue(item.likes ?? item.like_count);
      const comments = numberValue(item.comments ?? item.comment_count);
      const shares = numberValue(item.shares ?? item.share_count);

      return {
        externalId,
        ranking: numberValue(item.rank ?? item.ranking) ?? index + 1,
        name: stringValue(item.name, item.product_name, item.nick_name, item.nickname, item.user_name, item.username, item.title, firstProduct?.product_name),
        username: stringValue(item.user_name, item.username),
        followersCount: numberValue(item.followers_count ?? item.follower_count),
        gmv: gmv(item.gmv_range ?? item.gmv, currency),
        soldCount: numberValue(item.sold_count ?? item.sales ?? item.units_sold),
        price: numberValue(item.price),
        creatorCount: numberValue(item.creator_count),
        videoCount: numberValue(item.video_count),
        reviewCount: numberValue(item.review_count),
        rating: numberValue(item.rating),
        creatorExternalId: stringValue(item.creator_id, item.open_id),
        productExternalId: stringValue(item.product_id, firstProduct?.product_id),
        views,
        shopExternalId: stringValue(item.shop_id),
        shopName: stringValue(item.shop_name),
        imageUrl: imageUrlFrom(item.product_image),
        likes,
        comments,
        shares,
        durationSeconds: numberValue(item.duration),
        publishTimeIso: isoFromUnixSeconds(item.publish_time),
        engagementRate: engagementRateFrom(likes, comments, shares, views),
        rawPayload: item,
      } satisfies NormalizedBestseller;
    });
  }
}
