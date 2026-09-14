import type { TikTokShopClient } from '@/lib/tiktok/client';
import { TikTokApiError, TikTokSchemaError } from '@/lib/tiktok/errors';
import {
  describeSanitizedResponseShape,
  isRecord,
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

// client.request já garante `response.ok && code===0` antes de RESOLVER a promise
// (qualquer code de erro da TikTok já vira TikTokApiError lá dentro — ver
// lib/tiktok/client.ts) — então, a rigor, quem chega até aqui já passou por essa
// checagem. `assertNoApiErrorCode` só torna esse invariante explícito NESTE ponto
// (onde `data.videos`/`data.products` está prestes a ser interpretado), como
// segunda barreira: nunca confiar que "chegou até aqui" por si só prova sucesso,
// e nunca reportar "formato inesperado" quando na verdade a própria TikTok já
// tinha dito qual foi o erro.
function assertNoApiErrorCode(raw: unknown): void {
  if (!isRecord(raw)) return;
  const code = typeof raw.code === 'number' ? raw.code : undefined;
  if (code === undefined || code === 0) return;
  const message = typeof raw.message === 'string' ? raw.message : `TikTok Shop respondeu code ${code}.`;
  const requestId = typeof raw.request_id === 'string' ? raw.request_id : undefined;
  throw new TikTokApiError(message, undefined, code, requestId);
}

/** Loga só metadados sanitizados (nunca o payload) quando a lista esperada não
 * vem no formato documentado, E devolve esse mesmo objeto pra ser anexado ao
 * erro lançado (`TikTokSchemaError.details`) — assim o diagnóstico consegue
 * mostrar a causa na própria tela, sem depender de acesso a log de servidor
 * (que nem sempre está disponível pra quem está investigando). Ver
 * `describeSanitizedResponseShape` (lib/tiktok/shop-analytics.ts) para a lista
 * exata do que é capturado. */
function logUnexpectedFormat(endpoint: string, version: ShopAnalyticsApiVersion, raw: unknown, arrayKey: 'videos' | 'products') {
  const shape = describeSanitizedResponseShape(raw, arrayKey);
  console.error(`[shop-analytics] formato inesperado em ${endpoint} (${version})`, shape);
  return shape;
}

/** GET /analytics/<version>/shop_videos/performance — 1 página, versão explícita (sem fallback). */
export async function getShopVideoPerformancePage(client: TikTokShopClient, params: AnalyticsPageParams, version: ShopAnalyticsApiVersion): Promise<AnalyticsPage> {
  const raw = await client.request(SHOP_VIDEO_PERFORMANCE_PATH[version], toQuery(params));
  assertNoApiErrorCode(raw);
  const page = parseAnalyticsPage(raw, 'videos');
  if (!page) {
    const shape = logUnexpectedFormat('shop_videos/performance', version, raw, 'videos');
    throw new TikTokSchemaError(`Resposta de Shop Video Performance (${version}) em formato inesperado (data.videos ausente ou não é uma lista).`, { shape });
  }
  return page;
}

/** GET /analytics/<version>/shop_products/performance — 1 página, versão explícita (sem fallback). */
export async function getShopProductPerformancePage(client: TikTokShopClient, params: AnalyticsPageParams, version: ShopAnalyticsApiVersion): Promise<AnalyticsPage> {
  const raw = await client.request(SHOP_PRODUCT_PERFORMANCE_PATH[version], toQuery(params));
  assertNoApiErrorCode(raw);
  const page = parseAnalyticsPage(raw, 'products');
  if (!page) {
    const shape = logUnexpectedFormat('shop_products/performance', version, raw, 'products');
    throw new TikTokSchemaError(`Resposta de Shop Product Performance (${version}) em formato inesperado (data.products ausente ou não é uma lista).`, { shape });
  }
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
