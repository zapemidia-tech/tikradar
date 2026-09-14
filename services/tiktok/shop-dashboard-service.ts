import type { TikTokShopClient } from '@/lib/tiktok/client';
import { getShopProductPerformancePage, getShopVideoPerformancePage } from './shop-analytics-service';
import {
  classifyShopAnalyticsError,
  collectPaginated,
  SHOP_DASHBOARD_MAX_PAGES,
  toProductSummary,
  toVideoSummary,
  type AnalyticsPageParams,
  type ProductPerformanceSummary,
  type ShopAnalyticsErrorKind,
  type VideoPerformanceSummary,
} from '@/lib/tiktok/shop-analytics';

// Serviço EXCLUSIVO do painel "Minha loja" (app/minha-loja) — sempre versão
// 202605, NUNCA cai pra 202509 (diferente de shop-analytics-service.ts, que
// tem fallback automático pro diagnóstico). O painel é construído em cima de
// campos que só existem na 202605 (creator, total_performance com funil e
// canais) — misturar com 202509 exibiria colunas vazias sem explicação.
// Se 202605 não estiver disponível pra este app, isso é um erro real a
// mostrar (isVersionUnavailableError faria o fallback silencioso no
// diagnóstico; aqui não).

export type DashboardEndpointResult<T> =
  | { outcome: ShopAnalyticsErrorKind; code?: number; status?: number; message: string }
  | {
      outcome: 'success_with_data' | 'success_empty';
      latestAvailableDate: string | null;
      totalCount: number | null;
      itemCount: number;
      pagesFetched: number;
      /** true se havia mais páginas além de SHOP_DASHBOARD_MAX_PAGES — a UI deve dizer que a lista é parcial, nunca fingir que é o catálogo completo. */
      truncatedByPageLimit: boolean;
      items: T[];
    };

export async function fetchOwnShopVideos(client: TikTokShopClient, params: AnalyticsPageParams): Promise<DashboardEndpointResult<VideoPerformanceSummary>> {
  try {
    const result = await collectPaginated(
      (pageToken) => getShopVideoPerformancePage(client, { ...params, pageToken }, '202605'),
      (item) => toVideoSummary(item, '202605'),
      SHOP_DASHBOARD_MAX_PAGES,
    );
    return {
      outcome: result.items.length > 0 ? 'success_with_data' : 'success_empty',
      latestAvailableDate: result.lastPage?.latestAvailableDate ?? null,
      totalCount: result.lastPage?.totalCount ?? null,
      itemCount: result.items.length,
      pagesFetched: result.pagesFetched,
      truncatedByPageLimit: result.truncatedByPageLimit,
      items: result.items,
    };
  } catch (error) {
    const c = classifyShopAnalyticsError(error);
    return { outcome: c.kind, code: c.code, status: c.status, message: c.message };
  }
}

export async function fetchOwnShopProducts(client: TikTokShopClient, params: AnalyticsPageParams): Promise<DashboardEndpointResult<ProductPerformanceSummary>> {
  try {
    const result = await collectPaginated(
      (pageToken) => getShopProductPerformancePage(client, { ...params, pageToken }, '202605'),
      (item) => toProductSummary(item, '202605'),
      SHOP_DASHBOARD_MAX_PAGES,
    );
    return {
      outcome: result.items.length > 0 ? 'success_with_data' : 'success_empty',
      latestAvailableDate: result.lastPage?.latestAvailableDate ?? null,
      totalCount: result.lastPage?.totalCount ?? null,
      itemCount: result.items.length,
      pagesFetched: result.pagesFetched,
      truncatedByPageLimit: result.truncatedByPageLimit,
      items: result.items,
    };
  } catch (error) {
    const c = classifyShopAnalyticsError(error);
    return { outcome: c.kind, code: c.code, status: c.status, message: c.message };
  }
}
