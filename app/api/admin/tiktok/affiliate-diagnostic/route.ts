import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import type { TikTokCreatorClient } from '@/lib/tiktok/creator-client';
import { createAffiliateCreatorClient } from '@/services/tiktok/create-affiliate-creator-client';
import { collectAffiliateCreatorPages, getShowcaseProductsPage, searchAffiliateOrdersPage, searchTargetCollaborationsPage } from '@/services/tiktok/affiliate-creator-service';
import { classifyAffiliateCreatorError, toCreatorProfile } from '@/lib/tiktok/affiliate-creator';
import { AFFILIATE_CREATOR_SCOPES, grantedAffiliateCreatorScopes, hasAllAffiliateCreatorScopes } from '@/lib/tiktok/connection-purpose';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import { describeUnknownError } from '@/lib/tiktok/errors';

export const dynamic = 'force-dynamic';

function noStore<T>(body: T, init?: { status?: number }) {
  return NextResponse.json(body, { status: init?.status, headers: { 'cache-control': 'private, no-store' } });
}

// Diagnóstico SÓ DE LEITURA das 4 Affiliate Creator APIs — nunca grava em
// nenhuma tabela. Usa exclusivamente a conexão `affiliate_creator` do admin
// autenticado (createAffiliateCreatorClient nunca cai de volta num token de
// seller). Cada chamada é reportada separadamente: nome oficial, path,
// versão, scopes necessários, status, contagem, paginação, campos do 1º
// registro, erro classificado — nunca o payload bruto, nunca dados
// completos de comprador (a API de pedidos não retorna isso em nenhum
// campo documentado).

type ConnectionState = 'not_connected' | 'token_expired';
type CallFailure = 'insufficient_permission' | 'token_expired' | 'token_invalid' | 'wrong_token_identity' | 'unexpected_format' | 'api_error' | 'skipped_missing_shop_id';

interface CallMeta {
  apiName: string;
  path: string;
  version: string;
  requiredScopes: string[];
}

type CallResult =
  | ({ outcome: CallFailure } & { code?: number; status?: number; message: string })
  | {
      outcome: 'success_with_data' | 'success_empty';
      itemCount: number;
      totalCount: number | null;
      pagesFetched: number;
      truncatedByPageLimit: boolean;
      observedFields: string[];
      sample: unknown[];
    };

async function runCall<T>(fetchFirst: () => Promise<{ items: T[]; pagesFetched: number; truncatedByPageLimit: boolean; lastPage: { totalCount: number | null; observedFields: string[] } | null }>): Promise<CallResult> {
  try {
    const result = await fetchFirst();
    return {
      outcome: result.items.length > 0 ? 'success_with_data' : 'success_empty',
      itemCount: result.items.length,
      totalCount: result.lastPage?.totalCount ?? null,
      pagesFetched: result.pagesFetched,
      truncatedByPageLimit: result.truncatedByPageLimit,
      observedFields: result.lastPage?.observedFields ?? [],
      sample: result.items.slice(0, 3) as unknown[],
    };
  } catch (error) {
    const c = classifyAffiliateCreatorError(error);
    return { outcome: c.kind, code: c.code, status: c.status, message: c.message };
  }
}

async function diagnoseProfile(client: TikTokCreatorClient): Promise<{ meta: CallMeta; result: CallResult }> {
  const meta: CallMeta = { apiName: 'Get Creator Profile', path: '/affiliate_creator/202508/profiles', version: '202508', requiredScopes: ['creator.affiliate.info'] };
  try {
    const raw = await client.request(meta.path, {});
    const profile = toCreatorProfile(raw);
    if (!profile) return { meta, result: { outcome: 'unexpected_format', message: 'data ausente ou em formato inesperado.' } };
    const fields = Object.keys(profile).filter((k) => (profile as unknown as Record<string, unknown>)[k] !== null);
    return { meta, result: { outcome: 'success_with_data', itemCount: 1, totalCount: 1, pagesFetched: 1, truncatedByPageLimit: false, observedFields: fields, sample: [profile] } };
  } catch (error) {
    const c = classifyAffiliateCreatorError(error);
    return { meta, result: { outcome: c.kind, code: c.code, status: c.status, message: c.message } };
  }
}

async function diagnoseShowcaseProducts(client: TikTokCreatorClient): Promise<{ meta: CallMeta; result: CallResult }> {
  const meta: CallMeta = { apiName: 'Get Showcase Products', path: '/affiliate_creator/202405/showcases/products', version: '202405', requiredScopes: ['creator.showcase.read'] };
  const result = await runCall(() => collectAffiliateCreatorPages((pageToken) => getShowcaseProductsPage(client, { pageToken, origin: 'SHOWCASE' })));
  return { meta, result };
}

async function diagnoseAffiliateOrders(client: TikTokCreatorClient, window: { createTimeGe: number; createTimeLt: number }): Promise<{ meta: CallMeta; result: CallResult }> {
  const meta: CallMeta = { apiName: 'Search Creator Affiliate Orders', path: '/affiliate_creator/202410/orders/search', version: '202410', requiredScopes: ['creator.affiliate_collaboration.read'] };
  const result = await runCall(() => collectAffiliateCreatorPages((pageToken) => searchAffiliateOrdersPage(client, { pageToken, createTimeGe: window.createTimeGe, createTimeLt: window.createTimeLt })));
  return { meta, result };
}

async function diagnoseTargetCollaborations(client: TikTokCreatorClient, shopId: string | null): Promise<{ meta: CallMeta; result: CallResult }> {
  const meta: CallMeta = { apiName: 'Search Creator Target Collaborations', path: '/affiliate_creator/202405/target_collaborations/search', version: '202405', requiredScopes: ['creator.affiliate_collaboration.read'] };
  if (!shopId) {
    return {
      meta,
      result: {
        outcome: 'skipped_missing_shop_id',
        message: 'Esta API exige shop_id (obrigatório, documentado) — não há, dentro dos 3 scopes ativos, API que liste as lojas com que este criador colabora para descobri-lo automaticamente. Informe um shop_id para testar.',
      },
    };
  }
  const result = await runCall(() => collectAffiliateCreatorPages((pageToken) => searchTargetCollaborationsPage(client, { pageToken, shopId })));
  return { meta, result };
}

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (!profile) return noStore({ error: 'Autenticação necessária.' }, { status: 401 });
  if (profile.role !== 'admin') return noStore({ error: 'Apenas administradores.' }, { status: 403 });

  let shopId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { shop_id?: unknown };
    shopId = typeof body.shop_id === 'string' && body.shop_id.trim() ? body.shop_id.trim() : null;
  } catch {
    /* corpo opcional */
  }

  let clientResult: Awaited<ReturnType<typeof createAffiliateCreatorClient>>;
  let statusRow: Awaited<ReturnType<SupabaseTikTokTokenStore['status']>>;
  try {
    [clientResult, statusRow] = await Promise.all([createAffiliateCreatorClient(process.env, profile.userId), new SupabaseTikTokTokenStore(process.env).status(profile.userId, 'affiliate_creator')]);
  } catch (error) {
    return noStore({ error: describeUnknownError(error) }, { status: 503 });
  }

  if (clientResult.status !== 'ready') {
    const outcome: ConnectionState = clientResult.status === 'not_connected' ? 'not_connected' : 'token_expired';
    return noStore({ connection: { status: outcome } });
  }

  const grantedScopes = grantedAffiliateCreatorScopes(statusRow?.granted_scopes);
  const now = Math.floor(Date.now() / 1000);
  const window = { createTimeGe: now - 30 * 86400, createTimeLt: now }; // 30 dias — só pra diagnóstico, nunca usado como período "correto" fixo

  const [profileCall, showcaseCall, ordersCall, collaborationsCall] = await Promise.all([
    diagnoseProfile(clientResult.client),
    diagnoseShowcaseProducts(clientResult.client),
    diagnoseAffiliateOrders(clientResult.client, window),
    diagnoseTargetCollaborations(clientResult.client, shopId),
  ]);

  return noStore({
    connection: { status: 'ready', openId: clientResult.openId, allScopesGranted: hasAllAffiliateCreatorScopes(statusRow?.granted_scopes), scopes: grantedScopes, expectedScopes: AFFILIATE_CREATOR_SCOPES },
    queriedPeriod: window,
    calls: {
      profile: profileCall,
      showcaseProducts: showcaseCall,
      affiliateOrders: ordersCall,
      targetCollaborations: collaborationsCall,
    },
  });
}
