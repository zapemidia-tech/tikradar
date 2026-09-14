import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import type { TikTokShopClient } from '@/lib/tiktok/client';
import { createOwnShopClient } from '@/services/tiktok/create-own-shop-client';
import {
  fetchFirstShopProductPageWithFallback,
  fetchFirstShopVideoPageWithFallback,
  getShopProductPerformancePage,
  getShopVideoPerformancePage,
} from '@/services/tiktok/shop-analytics-service';
import { classifyShopAnalyticsError, collectPaginated, toProductSummary, toVideoSummary, type ShopAnalyticsApiVersion } from '@/lib/tiktok/shop-analytics';
import { defaultAnalyticsWindow, type AnalyticsWindow } from '@/lib/tiktok/shop-analytics-window';
import { timeZoneForRegion } from '@/lib/tiktok/reference-date';
import { describeUnknownError } from '@/lib/tiktok/errors';

export const dynamic = 'force-dynamic';

// Diagnóstico SÓ DE LEITURA das APIs de performance da própria loja — nunca
// grava em product_snapshots/creator_snapshots nem em nenhuma tabela. Não é
// a sincronização/dashboard de "Minha loja" (ainda não existe, de
// propósito — ver instruções desta tarefa). Usa exclusivamente a conexão
// `own_shop` do admin autenticado (createOwnShopClient nunca cai de volta
// no shop_cipher/token estático do Bestsellers).
//
// Cada endpoint tenta a versão 202605 (mais completa: identifica criador em
// vídeos, funil completo por canal em produtos) e só cai pra 202509 quando a
// própria TikTok diz que a versão não existe pra este app — nunca mistura
// campo de uma versão com o de outra (ver lib/tiktok/shop-analytics.ts).
// `version` no resultado sempre mostra qual delas respondeu de fato.

type ConnectionState = 'not_connected' | 'token_expired';
type ApiFailure = 'insufficient_permission' | 'invalid_period' | 'api_error';

type EndpointDiagnostic =
  | { outcome: ConnectionState }
  | ({ outcome: ApiFailure } & { code?: number; status?: number; message: string })
  | {
      outcome: 'success_with_data' | 'success_empty';
      version: ShopAnalyticsApiVersion;
      queriedWindow: AnalyticsWindow;
      latestAvailableDate: string | null;
      totalCount: number | null;
      itemCount: number;
      pagesFetched: number;
      truncatedByPageLimit: boolean;
      observedFields: string[];
      // Amostra pequena e só dos campos já tipados em lib/tiktok/shop-analytics.ts — nunca o payload bruto.
      sample: unknown[];
    };

async function diagnoseVideoEndpoint(client: TikTokShopClient, window: AnalyticsWindow): Promise<EndpointDiagnostic> {
  try {
    const first = await fetchFirstShopVideoPageWithFallback(client, { ...window, pageSize: 100 });
    const version = first.version;
    const result = await collectPaginated(
      (pageToken) => getShopVideoPerformancePage(client, { ...window, pageToken, pageSize: 100 }, version),
      (item) => toVideoSummary(item, version),
      undefined,
      first.page,
    );
    return {
      outcome: result.items.length > 0 ? 'success_with_data' : 'success_empty',
      version,
      queriedWindow: window,
      latestAvailableDate: result.lastPage?.latestAvailableDate ?? null,
      totalCount: result.lastPage?.totalCount ?? null,
      itemCount: result.items.length,
      pagesFetched: result.pagesFetched,
      truncatedByPageLimit: result.truncatedByPageLimit,
      observedFields: result.lastPage?.observedFields ?? [],
      sample: result.items.slice(0, 3),
    };
  } catch (error) {
    const c = classifyShopAnalyticsError(error);
    return { outcome: c.kind, code: c.code, status: c.status, message: c.message };
  }
}

async function diagnoseProductEndpoint(client: TikTokShopClient, window: AnalyticsWindow): Promise<EndpointDiagnostic> {
  try {
    const first = await fetchFirstShopProductPageWithFallback(client, { ...window, pageSize: 100 });
    const version = first.version;
    const result = await collectPaginated(
      (pageToken) => getShopProductPerformancePage(client, { ...window, pageToken, pageSize: 100 }, version),
      (item) => toProductSummary(item, version),
      undefined,
      first.page,
    );
    return {
      outcome: result.items.length > 0 ? 'success_with_data' : 'success_empty',
      version,
      queriedWindow: window,
      latestAvailableDate: result.lastPage?.latestAvailableDate ?? null,
      totalCount: result.lastPage?.totalCount ?? null,
      itemCount: result.items.length,
      pagesFetched: result.pagesFetched,
      truncatedByPageLimit: result.truncatedByPageLimit,
      observedFields: result.lastPage?.observedFields ?? [],
      sample: result.items.slice(0, 3),
    };
  } catch (error) {
    const c = classifyShopAnalyticsError(error);
    return { outcome: c.kind, code: c.code, status: c.status, message: c.message };
  }
}

export async function POST() {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403 });

  let clientResult: Awaited<ReturnType<typeof createOwnShopClient>>;
  try {
    clientResult = await createOwnShopClient(process.env, profile.userId);
  } catch (error) {
    // Nunca deixa o texto bruto do erro (pode ecoar detalhes de configuração) ir ao cliente sem passar pela mesma sanitização do resto do app.
    return NextResponse.json({ error: describeUnknownError(error) }, { status: 503 });
  }

  if (clientResult.status !== 'ready') {
    const outcome: ConnectionState = clientResult.status === 'not_connected' ? 'not_connected' : 'token_expired';
    return NextResponse.json({
      connection: { status: clientResult.status },
      video: { outcome } satisfies EndpointDiagnostic,
      product: { outcome } satisfies EndpointDiagnostic,
    });
  }

  const window = defaultAnalyticsWindow(new Date(), timeZoneForRegion(clientResult.sellerBaseRegion));
  const [video, product] = await Promise.all([diagnoseVideoEndpoint(clientResult.client, window), diagnoseProductEndpoint(clientResult.client, window)]);

  return NextResponse.json({
    connection: { status: 'ready', sellerName: clientResult.sellerName, sellerBaseRegion: clientResult.sellerBaseRegion },
    queriedWindow: window,
    video,
    product,
  });
}
