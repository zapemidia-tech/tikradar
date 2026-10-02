import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCreatorAuthorizationCode } from '@/lib/tiktok/creator-auth';
import { getTikTokCreatorConfig } from '@/lib/tiktok/creator-config';
import { TikTokCreatorClient } from '@/lib/tiktok/creator-client';
import { getCreatorProfile } from '@/services/tiktok/affiliate-creator-service';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import { getSessionUser, signInPath } from '@/lib/auth/session';
import { diagnoseCallback } from '@/lib/tiktok/oauth-state';
import type { AffiliateCreatorOAuthErrorCode } from '@/lib/tiktok/creator-oauth-messages';

const ADMIN_PAGE = '/admin/integrations/tiktok';
const CREATOR_USER_TYPE = 1; // confirmado no "Creator authorization guide" oficial: user_type===1 = criador, 0 = vendedor.

function redirectWithClearedCookie(url: URL) {
  const response = NextResponse.redirect(url);
  response.cookies.delete('tiktok_creator_oauth_state');
  response.headers.set('cache-control', 'no-store');
  return response;
}

function errorRedirect(request: Request, code: AffiliateCreatorOAuthErrorCode) {
  return redirectWithClearedCookie(new URL(`${ADMIN_PAGE}?purpose=affiliate_creator&error=${code}`, request.url));
}

// Callback SEPARADO do seller (/api/tiktok/oauth/callback) — lê só o cookie
// `tiktok_creator_oauth_state`, nunca o do seller. Salva SEMPRE como
// `affiliate_creator` (nunca aceita um `?purpose=` da URL). Autorização
// parcial (faltando algum dos 3 scopes esperados) NÃO é rejeitada aqui — a
// conexão é salva e a tela de integrações mostra "permissão pendente" com
// os scopes faltando (mesmo padrão já usado por own_shop); só os motivos
// abaixo impedem salvar.
export async function GET(request: Request) {
  const user = await getSessionUser();
  const jar = await cookies();

  if (!user) {
    // Sessão do TikRadar caiu no meio do fluxo (raro) — manda pro login, limpa o cookie de OAuth (não serve mais).
    return redirectWithClearedCookie(new URL(signInPath(ADMIN_PAGE), request.url));
  }

  const url = new URL(request.url);

  // TikTok manda um `error` explícito quando o criador nega a autorização
  // (padrão OAuth comum) — checado ANTES do resto do diagnóstico, pra nunca
  // reportar "código ausente" quando na verdade foi uma recusa explícita.
  if (url.searchParams.get('error')) return errorRedirect(request, 'cancelled');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = jar.get('tiktok_creator_oauth_state')?.value ?? null;

  const problem = diagnoseCallback({ code, state, expectedFromCookie: expected });
  if (problem) return errorRedirect(request, problem);

  const config = getTikTokCreatorConfig();
  let tokens;
  try {
    tokens = await exchangeCreatorAuthorizationCode(config, code!);
  } catch {
    return errorRedirect(request, 'exchange_failed');
  }

  // Recusa explicitamente um token de vendedor usado no fluxo de criador —
  // nunca salva, nunca tenta "adivinhar" o propósito pelo valor.
  if (tokens.userType !== CREATOR_USER_TYPE) return errorRedirect(request, 'not_creator');

  // Busca username/região pra mostrar na tela de integrações (seção 5 do
  // pedido) — NÃO vem na resposta do token (diferente do seller, cujo
  // seller_name/region vêm de getAuthorizedShop no próprio callback). Melhor
  // esforço: se falhar, salva a conexão mesmo assim sem esses campos (nunca
  // bloqueia a conexão por causa disso). Reaproveita as colunas
  // seller_name/seller_base_region (já existentes, nullable, nunca
  // específicas de propósito) — nenhuma migration nova precisa disso.
  let displayName: string | undefined;
  let displayRegion: string | undefined;
  try {
    const profile = await getCreatorProfile(new TikTokCreatorClient(config, tokens.accessToken));
    displayName = profile.username ?? undefined;
    displayRegion = profile.selectionRegion ?? undefined;
  } catch {
    /* best-effort — a conexão ainda é salva sem esses campos */
  }

  try {
    await new SupabaseTikTokTokenStore().save({ ...tokens, sellerName: displayName, sellerBaseRegion: displayRegion }, user.userId, 'affiliate_creator');
  } catch {
    return errorRedirect(request, 'save_failed');
  }

  return redirectWithClearedCookie(new URL(`${ADMIN_PAGE}?purpose=affiliate_creator&connected=1`, request.url));
}
