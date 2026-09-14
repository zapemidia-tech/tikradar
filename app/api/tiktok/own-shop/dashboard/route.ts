import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { createOwnShopClient } from '@/services/tiktok/create-own-shop-client';
import { fetchOwnShopProducts, fetchOwnShopVideos } from '@/services/tiktok/shop-dashboard-service';
import { hasShopAnalyticsScope } from '@/lib/tiktok/connection-purpose';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import { defaultAnalyticsWindow, resolveRequestedAnalyticsWindow, type AnalyticsWindow, type AnalyticsWindowValidationError } from '@/lib/tiktok/shop-analytics-window';
import { timeZoneForRegion } from '@/lib/tiktok/reference-date';
import { describeUnknownError } from '@/lib/tiktok/errors';

export const dynamic = 'force-dynamic';

// Dados exclusivamente da conexão `own_shop` DO USUÁRIO AUTENTICADO — nunca
// lê nem mistura com `bestsellers_sync` (ver lib/tiktok/connection-purpose.ts
// e services/tiktok/create-own-shop-client.ts, que já garantem isso).
// Isolamento entre usuários/lojas vem de `SupabaseTikTokTokenStore.latest`
// sempre filtrar por `platform_user_id = userId` — nada aqui contorna isso.
//
// Sempre versão 202605, sem fallback (ver services/tiktok/shop-dashboard-service.ts).
// Nunca grava nada no Supabase — só leitura ao vivo da TikTok, igual ao
// diagnóstico (app/api/admin/tiktok/shop-analytics-diagnostic).

type ConnectionStatus = 'not_connected' | 'token_expired' | 'permission_pending' | 'ready';

function noStore<T>(body: T, init?: { status?: number }) {
  return NextResponse.json(body, { status: init?.status, headers: { 'cache-control': 'private, no-store' } });
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return noStore({ error: 'Autenticação necessária.' }, { status: 401 });

  let clientResult: Awaited<ReturnType<typeof createOwnShopClient>>;
  let statusRow: Awaited<ReturnType<SupabaseTikTokTokenStore['status']>>;
  try {
    [clientResult, statusRow] = await Promise.all([createOwnShopClient(process.env, user.userId), new SupabaseTikTokTokenStore(process.env).status(user.userId, 'own_shop')]);
  } catch (error) {
    // Nunca deixa o texto bruto do erro (pode ecoar detalhes de configuração) ir ao cliente sem sanitização.
    return noStore({ error: describeUnknownError(error) }, { status: 503 });
  }

  if (clientResult.status === 'not_connected') return noStore({ connection: { status: 'not_connected' satisfies ConnectionStatus } });
  if (clientResult.status === 'expired') return noStore({ connection: { status: 'token_expired' satisfies ConnectionStatus } });

  const timeZone = timeZoneForRegion(clientResult.sellerBaseRegion);
  const connectionInfo = { sellerName: clientResult.sellerName, sellerBaseRegion: clientResult.sellerBaseRegion, timeZone };

  // Permissão confirmada na ÚLTIMA autorização salva (granted_scopes) — checado
  // ANTES de qualquer chamada à TikTok, mesmo raciocínio já usado em
  // app/admin/integrations/tiktok/page.tsx (resolveOwnShopState). Uma chamada
  // real ainda pode devolver 105005 mesmo assim (escopo revogado depois da
  // última autorização) — isso vira 'insufficient_permission' por endpoint,
  // não confundido com este estado.
  if (!hasShopAnalyticsScope(statusRow?.granted_scopes)) {
    return noStore({ connection: { status: 'permission_pending' satisfies ConnectionStatus, ...connectionInfo } });
  }

  const url = new URL(request.url);
  const startParam = url.searchParams.get('start_date_ge');
  const endParam = url.searchParams.get('end_date_lt');
  const now = new Date();

  let window: AnalyticsWindow;
  if (startParam && endParam) {
    const resolved = resolveRequestedAnalyticsWindow({ startDateGe: startParam, endDateLt: endParam }, now, timeZone);
    if (!resolved.ok) {
      const periodError: AnalyticsWindowValidationError = resolved.error;
      return noStore({ connection: { status: 'ready' satisfies ConnectionStatus, ...connectionInfo }, periodError }, { status: 400 });
    }
    window = resolved.window;
  } else {
    window = defaultAnalyticsWindow(now, timeZone);
  }

  const params = { ...window, pageSize: 100, sortField: 'gmv', sortOrder: 'DESC' as const };
  const [video, product] = await Promise.all([fetchOwnShopVideos(clientResult.client, params), fetchOwnShopProducts(clientResult.client, params)]);

  return noStore({
    connection: { status: 'ready' satisfies ConnectionStatus, ...connectionInfo },
    queriedWindow: window,
    video,
    product,
  });
}
