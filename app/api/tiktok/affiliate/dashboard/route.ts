import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { createAffiliateCreatorClient } from '@/services/tiktok/create-affiliate-creator-client';
import { collectAffiliateCreatorPages, getCreatorProfile, getShowcaseProductsPage, searchAffiliateOrdersPage, searchTargetCollaborationsPage } from '@/services/tiktok/affiliate-creator-service';
import { aggregateVideoSales, classifyAffiliateCreatorError, type AffiliateCreatorErrorKind } from '@/lib/tiktok/affiliate-creator';
import { grantedAffiliateCreatorScopes, hasAllAffiliateCreatorScopes } from '@/lib/tiktok/connection-purpose';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import { defaultAffiliateOrdersWindow, resolveAffiliateOrdersWindow, type AffiliateOrdersWindow, type AffiliateOrdersWindowValidationError } from '@/lib/tiktok/affiliate-creator-window';
import { describeUnknownError } from '@/lib/tiktok/errors';

export const dynamic = 'force-dynamic';

// Dados exclusivamente da conexão `affiliate_creator` DO USUÁRIO AUTENTICADO
// — nunca lê nem mistura com `own_shop`/`bestsellers_sync`. Isolamento vem
// de SupabaseTikTokTokenStore.latest sempre filtrar por platform_user_id +
// connection_purpose (inalterado por esta rota). Nunca grava nada no
// Supabase — só leitura ao vivo. Cache-Control: private, no-store (dado
// privado por usuário, nunca cacheável por CDN/proxy compartilhado).
//
// `content_id`+`content_type==='VIDEO'` em cada SKU de pedido é a única
// atribuição por vídeo OFICIAL que a TikTok fornece dentro dos 3 scopes
// ativos — ver docs/tiktok-affiliate-creator-fields.md. Não existe API,
// nos scopes ativos, que resolva esse content_id em título/miniatura/views/
// CTR — por isso a UI mostra o ranking por ID técnico, nunca inventando
// metadado nenhum.

type ConnectionStatus = 'not_connected' | 'token_expired' | 'permission_pending' | 'ready';

function noStore<T>(body: T, init?: { status?: number }) {
  return NextResponse.json(body, { status: init?.status, headers: { 'cache-control': 'private, no-store' } });
}

type CallFailure = Exclude<AffiliateCreatorErrorKind, never>;
type CallResult<T> =
  | ({ outcome: CallFailure } & { code?: number; status?: number; message: string })
  | { outcome: 'success_with_data' | 'success_empty'; itemCount: number; totalCount: number | null; pagesFetched: number; truncatedByPageLimit: boolean; items: T[] };

async function runCall<T>(fetchPage: (pageToken: string | undefined) => Promise<{ items: T[]; observedFields: string[]; totalCount: number | null; nextPageToken: string | null }>): Promise<CallResult<T>> {
  try {
    const result = await collectAffiliateCreatorPages(fetchPage);
    return {
      outcome: result.items.length > 0 ? 'success_with_data' : 'success_empty',
      itemCount: result.items.length,
      totalCount: result.lastPage?.totalCount ?? null,
      pagesFetched: result.pagesFetched,
      truncatedByPageLimit: result.truncatedByPageLimit,
      items: result.items,
    };
  } catch (error) {
    const c = classifyAffiliateCreatorError(error);
    return { outcome: c.kind, code: c.code, status: c.status, message: c.message };
  }
}

function isSuccess<T>(r: CallResult<T>): r is Extract<CallResult<T>, { outcome: 'success_with_data' | 'success_empty' }> {
  return r.outcome === 'success_with_data' || r.outcome === 'success_empty';
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return noStore({ error: 'Autenticação necessária.' }, { status: 401 });

  let clientResult: Awaited<ReturnType<typeof createAffiliateCreatorClient>>;
  let statusRow: Awaited<ReturnType<SupabaseTikTokTokenStore['status']>>;
  try {
    [clientResult, statusRow] = await Promise.all([createAffiliateCreatorClient(process.env, user.userId), new SupabaseTikTokTokenStore(process.env).status(user.userId, 'affiliate_creator')]);
  } catch (error) {
    return noStore({ error: describeUnknownError(error) }, { status: 503 });
  }

  if (clientResult.status === 'not_connected') return noStore({ connection: { status: 'not_connected' satisfies ConnectionStatus } });
  if (clientResult.status === 'expired') return noStore({ connection: { status: 'token_expired' satisfies ConnectionStatus } });

  if (!hasAllAffiliateCreatorScopes(statusRow?.granted_scopes)) {
    return noStore({ connection: { status: 'permission_pending' satisfies ConnectionStatus, scopes: grantedAffiliateCreatorScopes(statusRow?.granted_scopes) } });
  }

  const url = new URL(request.url);
  const geParam = url.searchParams.get('create_time_ge');
  const ltParam = url.searchParams.get('create_time_lt');
  const shopId = url.searchParams.get('shop_id');
  const now = new Date();

  let window: AffiliateOrdersWindow;
  if (geParam && ltParam) {
    const resolved = resolveAffiliateOrdersWindow({ createTimeGe: Number(geParam), createTimeLt: Number(ltParam) }, now);
    if (!resolved.ok) {
      const periodError: AffiliateOrdersWindowValidationError = resolved.error;
      return noStore({ connection: { status: 'ready' satisfies ConnectionStatus }, periodError }, { status: 400 });
    }
    window = resolved.window;
  } else {
    window = defaultAffiliateOrdersWindow(now);
  }

  const client = clientResult.client;

  const [profileResult, ordersResult, showcaseResult] = await Promise.all([
    getCreatorProfile(client)
      .then((profile) => ({ ok: true as const, profile }))
      .catch((error) => ({ ok: false as const, classified: classifyAffiliateCreatorError(error) })),
    runCall((pageToken) => searchAffiliateOrdersPage(client, { pageToken, createTimeGe: window.createTimeGe, createTimeLt: window.createTimeLt })),
    runCall((pageToken) => getShowcaseProductsPage(client, { pageToken, origin: 'SHOWCASE' })),
  ]);

  const videoSales = isSuccess(ordersResult) ? aggregateVideoSales(ordersResult.items) : [];
  const nonVideoOrderCount = isSuccess(ordersResult) ? ordersResult.items.filter((o) => !o.skus.some((s) => s.contentType === 'VIDEO' && s.contentId)).length : 0;

  let collaborationsResult: CallResult<unknown> | { outcome: 'shop_id_required' } = { outcome: 'shop_id_required' };
  if (shopId) {
    collaborationsResult = await runCall((pageToken) => searchTargetCollaborationsPage(client, { pageToken, shopId }));
  }

  return noStore({
    connection: { status: 'ready' satisfies ConnectionStatus, openId: clientResult.openId },
    profile: profileResult.ok ? profileResult.profile : null,
    profileError: profileResult.ok ? null : { kind: profileResult.classified.kind, message: profileResult.classified.message },
    queriedWindow: window,
    orders: ordersResult,
    videoSales,
    nonVideoOrderCount,
    showcaseProducts: showcaseResult,
    collaborations: collaborationsResult,
  });
}
