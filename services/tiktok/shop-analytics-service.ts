import type { TikTokShopClient } from '@/lib/tiktok/client';
import { TikTokSchemaError } from '@/lib/tiktok/errors';
import {
  isVersionUnavailableError,
  parseAnalyticsPage,
  SHOP_PRODUCT_PERFORMANCE_PATH,
  SHOP_VIDEO_PERFORMANCE_PATH,
  type AnalyticsPage,
  type AnalyticsPageParams,
  type ShopAnalyticsApiVersion,
} from '@/lib/tiktok/shop-analytics';

// Ordem de preferência: tenta a versão mais completa (202605 — traz
// identificação de criador em vídeos e o funil completo por canal em
// produtos) e só cai para a anterior (202509) quando a própria TikTok disser
// que a versão/rota não existe pra este app (ver isVersionUnavailableError)
// — nunca por qualquer outro motivo (período inválido, permissão etc. devem
// propagar normalmente, sem tentar outra versão). Mesmo espírito do
// `withDateFallback` já usado no Bestsellers: no máximo 1 nova tentativa.
export const SHOP_ANALYTICS_VERSION_PREFERENCE: readonly ShopAnalyticsApiVersion[] = ['202605', '202509'];

function toQuery(params: AnalyticsPageParams) {
  return {
    start_date_ge: params.startDateGe,
    end_date_lt: params.endDateLt,
    page_size: params.pageSize,
    page_token: params.pageToken,
    sort_field: params.sortField,
    sort_order: params.sortOrder,
    currency: params.currency,
  };
}

/** GET /analytics/<version>/shop_videos/performance — 1 página, versão explícita (sem fallback). */
export async function getShopVideoPerformancePage(client: TikTokShopClient, params: AnalyticsPageParams, version: ShopAnalyticsApiVersion): Promise<AnalyticsPage> {
  const raw = await client.request(SHOP_VIDEO_PERFORMANCE_PATH[version], toQuery(params));
  const page = parseAnalyticsPage(raw, 'videos');
  if (!page) throw new TikTokSchemaError(`Resposta de Shop Video Performance (${version}) em formato inesperado (data.videos ausente ou não é uma lista).`);
  return page;
}

/** GET /analytics/<version>/shop_products/performance — 1 página, versão explícita (sem fallback). */
export async function getShopProductPerformancePage(client: TikTokShopClient, params: AnalyticsPageParams, version: ShopAnalyticsApiVersion): Promise<AnalyticsPage> {
  const raw = await client.request(SHOP_PRODUCT_PERFORMANCE_PATH[version], toQuery(params));
  const page = parseAnalyticsPage(raw, 'products');
  if (!page) throw new TikTokSchemaError(`Resposta de Shop Product Performance (${version}) em formato inesperado (data.products ausente ou não é uma lista).`);
  return page;
}

export interface VersionedPage {
  page: AnalyticsPage;
  version: ShopAnalyticsApiVersion;
}

/**
 * Tenta cada versão de `SHOP_ANALYTICS_VERSION_PREFERENCE` em ordem, só
 * avançando pra próxima quando `isVersionUnavailableError` é true — qualquer
 * outro erro (período inválido, permissão, token) propaga imediatamente,
 * sem mascarar a causa real tentando outra versão. Se TODAS as versões
 * falharem por indisponibilidade, propaga o erro da ÚLTIMA tentativa (a mais
 * "atual" do ponto de vista do chamador).
 */
async function fetchFirstPageWithFallback(
  fetchOne: (version: ShopAnalyticsApiVersion) => Promise<AnalyticsPage>,
): Promise<VersionedPage> {
  let lastError: unknown;
  for (const version of SHOP_ANALYTICS_VERSION_PREFERENCE) {
    try {
      return { page: await fetchOne(version), version };
    } catch (error) {
      lastError = error;
      if (!isVersionUnavailableError(error)) throw error;
    }
  }
  throw lastError;
}

export function fetchFirstShopVideoPageWithFallback(client: TikTokShopClient, params: AnalyticsPageParams): Promise<VersionedPage> {
  return fetchFirstPageWithFallback((version) => getShopVideoPerformancePage(client, params, version));
}

export function fetchFirstShopProductPageWithFallback(client: TikTokShopClient, params: AnalyticsPageParams): Promise<VersionedPage> {
  return fetchFirstPageWithFallback((version) => getShopProductPerformancePage(client, params, version));
}
