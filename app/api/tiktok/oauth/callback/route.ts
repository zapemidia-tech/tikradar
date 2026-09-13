import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeAuthorizationCode, getAuthorizedShop } from '@/lib/tiktok/auth';
import { getTikTokConfig } from '@/lib/tiktok/config';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import { getSessionUser, signInPath } from '@/lib/auth/session';
import { diagnoseCallback } from '@/lib/tiktok/oauth-state';
import { parseConnectionPurpose, resolveConfirmedShop } from '@/lib/tiktok/connection-purpose';
import type { OwnShopOAuthErrorCode } from '@/lib/tiktok/oauth-messages';

const ADMIN_PAGE = '/admin/integrations/tiktok';

function redirectWithClearedCookies(request: Request, url: URL, extraCookies?: { name: string; value: string }[]) {
  const response = NextResponse.redirect(url);
  response.cookies.delete('tiktok_oauth_state');
  response.cookies.delete('tiktok_oauth_purpose');
  for (const c of extraCookies ?? []) response.cookies.set(c.name, c.value);
  response.headers.set('cache-control', 'no-store');
  return response;
}

function errorRedirect(request: Request, purpose: string, code: OwnShopOAuthErrorCode) {
  return redirectWithClearedCookies(request, new URL(`${ADMIN_PAGE}?purpose=${purpose}&error=${code}`, request.url));
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  const jar = await cookies();
  const purpose = parseConnectionPurpose(jar.get('tiktok_oauth_purpose')?.value);

  if (!user) {
    // Sessão do TikRadar caiu no meio do fluxo (raro, mas TikTok pode demorar
    // no consentimento) — manda pro login em vez de expor um 401 cru numa
    // navegação de topo, e limpa os cookies de OAuth (não servem mais).
    return redirectWithClearedCookies(request, new URL(signInPath(ADMIN_PAGE), request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = jar.get('tiktok_oauth_state')?.value ?? null;

  const problem = diagnoseCallback({ code, state, expectedFromCookie: expected });
  if (problem) return errorRedirect(request, purpose, problem);

  const config = getTikTokConfig();
  let tokens;
  try {
    tokens = await exchangeAuthorizationCode(config, code!);
  } catch {
    return errorRedirect(request, purpose, 'exchange_failed');
  }

  if (tokens.userType !== 0) return errorRedirect(request, purpose, 'not_seller');

  let liveShop: { cipher: string; name?: string; region?: string } | null = null;
  try {
    liveShop = await getAuthorizedShop(config, tokens.accessToken);
  } catch {
    liveShop = null; // resolveConfirmedShop decide o que fazer com isso, conforme o propósito
  }

  const shop = resolveConfirmedShop({
    purpose,
    liveShop,
    staticShopCipher: config.shopCipher,
    staticFallbackName: tokens.sellerName,
    staticFallbackRegion: tokens.sellerBaseRegion,
  });
  if (!shop) return errorRedirect(request, purpose, 'shop_not_confirmed');

  try {
    await new SupabaseTikTokTokenStore().save(
      { ...tokens, shopCipher: shop.cipher, sellerName: shop.name ?? tokens.sellerName, sellerBaseRegion: shop.region ?? tokens.sellerBaseRegion },
      user.userId,
      purpose,
    );
  } catch {
    return errorRedirect(request, purpose, 'save_failed');
  }

  return redirectWithClearedCookies(request, new URL(`${ADMIN_PAGE}?purpose=${purpose}&connected=1`, request.url));
}
