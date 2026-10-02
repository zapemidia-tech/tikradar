import type { TikTokCreatorClient } from '@/lib/tiktok/creator-client';
import { TikTokApiError, TikTokSchemaError } from '@/lib/tiktok/errors';
import {
  isRecord,
  parseAffiliateCreatorPage,
  toAffiliateOrder,
  toCreatorProfile,
  toShowcaseProduct,
  toTargetCollaboration,
  type AffiliateCreatorPage,
  type AffiliateOrderSummary,
  type CreatorProfile,
  type ShowcaseProduct,
  type TargetCollaboration,
} from '@/lib/tiktok/affiliate-creator';

// Paths/versões/métodos/scopes confirmados na doc oficial — ver cabeçalho
// de lib/tiktok/affiliate-creator.ts.
const PROFILE_PATH = '/affiliate_creator/202508/profiles';
const SHOWCASE_PRODUCTS_PATH = '/affiliate_creator/202405/showcases/products';
const AFFILIATE_ORDERS_PATH = '/affiliate_creator/202410/orders/search';
const TARGET_COLLABORATIONS_PATH = '/affiliate_creator/202405/target_collaborations/search';

// Limites documentados por endpoint (page_size máx.) — nunca excedidos.
export const SHOWCASE_PRODUCTS_MAX_PAGE_SIZE = 20;
export const AFFILIATE_ORDERS_MAX_PAGE_SIZE = 100;
export const TARGET_COLLABORATIONS_MAX_PAGE_SIZE = 100;

// Limite de segurança de páginas — nunca uma varredura completa do
// histórico, mesmo requests paginados (mesmo raciocínio de
// SHOP_DASHBOARD_MAX_PAGES em lib/tiktok/shop-analytics.ts, duplicado aqui
// de propósito: mudar o limite de um painel nunca deve afetar o outro
// silenciosamente).
export const AFFILIATE_CREATOR_MAX_PAGES = 5;

function assertNoApiErrorCode(raw: unknown): void {
  if (!isRecord(raw)) return;
  const code = typeof raw.code === 'number' ? raw.code : undefined;
  if (code === undefined || code === 0) return;
  const message = typeof raw.message === 'string' ? raw.message : `TikTok Shop (criador) respondeu code ${code}.`;
  const requestId = typeof raw.request_id === 'string' ? raw.request_id : undefined;
  throw new TikTokApiError(message, undefined, code, requestId);
}

/** GET Get Creator Profile. Nunca lança por campo secundário ausente — só por `data` ausente/do tipo errado (formato inesperado). */
export async function getCreatorProfile(client: TikTokCreatorClient): Promise<CreatorProfile> {
  const raw = await client.request(PROFILE_PATH, {});
  assertNoApiErrorCode(raw);
  const profile = toCreatorProfile(raw);
  if (!profile) throw new TikTokSchemaError('Resposta de Get Creator Profile em formato inesperado (data ausente).');
  return profile;
}

export interface ShowcasePageParams {
  pageToken?: string;
  pageSize?: number;
  /** Obrigatório pela doc oficial — LIVE ou SHOWCASE. O painel usa SHOWCASE (produtos da vitrine, não os da live em andamento). */
  origin: 'LIVE' | 'SHOWCASE';
}

export async function getShowcaseProductsPage(client: TikTokCreatorClient, params: ShowcasePageParams): Promise<AffiliateCreatorPage<ShowcaseProduct>> {
  const raw = await client.request(SHOWCASE_PRODUCTS_PATH, {
    page_size: params.pageSize ?? SHOWCASE_PRODUCTS_MAX_PAGE_SIZE,
    page_token: params.pageToken,
    origin: params.origin,
  });
  assertNoApiErrorCode(raw);
  const page = parseAffiliateCreatorPage(raw, 'products', toShowcaseProduct);
  if (!page) throw new TikTokSchemaError('Resposta de Get Showcase Products em formato inesperado (data.products ausente ou não é uma lista).');
  return page;
}

export interface AffiliateOrdersPageParams {
  pageToken?: string;
  pageSize?: number;
  /** Unix timestamp (segundos) — documentado como `create_time_ge`/`create_time_lt`, não `start_date_ge`/`end_date_lt` como as APIs de shop analytics. */
  createTimeGe?: number;
  createTimeLt?: number;
}

export async function searchAffiliateOrdersPage(client: TikTokCreatorClient, params: AffiliateOrdersPageParams): Promise<AffiliateCreatorPage<AffiliateOrderSummary>> {
  const raw = await client.request(
    AFFILIATE_ORDERS_PATH,
    { page_size: params.pageSize ?? AFFILIATE_ORDERS_MAX_PAGE_SIZE, page_token: params.pageToken },
    { method: 'POST', body: { create_time_ge: params.createTimeGe, create_time_lt: params.createTimeLt } },
  );
  assertNoApiErrorCode(raw);
  const page = parseAffiliateCreatorPage(raw, 'orders', toAffiliateOrder);
  if (!page) throw new TikTokSchemaError('Resposta de Search Creator Affiliate Orders em formato inesperado (data.orders ausente ou não é uma lista).');
  return page;
}

export interface TargetCollaborationsPageParams {
  pageToken?: string;
  pageSize?: number;
  /** OBRIGATÓRIO pela doc oficial — não há, dentro dos 3 scopes ativos, nenhuma API que liste as lojas com que o criador colabora pra descobrir isso automaticamente (ver docs/tiktok-affiliate-creator-fields.md). Quem chama precisa fornecer. */
  shopId: string;
  keywordType?: 'TARGET_COLLABORATIONS_ID' | 'TARGET_COLLABORATIONS_NAME';
  keyword?: string;
}

export async function searchTargetCollaborationsPage(client: TikTokCreatorClient, params: TargetCollaborationsPageParams): Promise<AffiliateCreatorPage<TargetCollaboration>> {
  const raw = await client.request(
    TARGET_COLLABORATIONS_PATH,
    { page_size: params.pageSize ?? TARGET_COLLABORATIONS_MAX_PAGE_SIZE, page_token: params.pageToken },
    { method: 'POST', body: { shop_id: params.shopId, keyword_type: params.keywordType, keyword: params.keyword } },
  );
  assertNoApiErrorCode(raw);
  const page = parseAffiliateCreatorPage(raw, 'target_collaborations', toTargetCollaboration);
  if (!page) throw new TikTokSchemaError('Resposta de Search Creator Target Collaborations em formato inesperado (data.target_collaborations ausente ou não é uma lista).');
  return page;
}

export interface CollectedAffiliateCreatorPages<T> {
  items: T[];
  pagesFetched: number;
  truncatedByPageLimit: boolean;
  lastPage: AffiliateCreatorPage<T> | null;
}

/** Segue `next_page_token` até `maxPages` ou até parar de vir — mesmo raciocínio de collectPaginated (shop-analytics.ts), duplicado aqui por separação deliberada entre os dois módulos. */
export async function collectAffiliateCreatorPages<T>(
  fetchPage: (pageToken: string | undefined) => Promise<AffiliateCreatorPage<T>>,
  maxPages: number = AFFILIATE_CREATOR_MAX_PAGES,
): Promise<CollectedAffiliateCreatorPages<T>> {
  const items: T[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;
  let lastPage: AffiliateCreatorPage<T> | null = null;
  let truncatedByPageLimit = false;

  while (pagesFetched < maxPages) {
    const page = await fetchPage(pageToken);
    lastPage = page;
    pagesFetched++;
    items.push(...page.items);
    if (!page.nextPageToken) break;
    if (pagesFetched >= maxPages) {
      truncatedByPageLimit = true;
      break;
    }
    pageToken = page.nextPageToken;
  }

  return { items, pagesFetched, truncatedByPageLimit, lastPage };
}
