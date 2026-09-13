import { NextResponse } from 'next/server';
import { createSellerAuthorizationUrl } from '@/lib/tiktok/auth';
import { getTikTokConfig } from '@/lib/tiktok/config';
import { getSessionUser } from '@/lib/auth/session';
import { createOAuthState } from '@/lib/tiktok/oauth-state';
import { parseConnectionPurpose } from '@/lib/tiktok/connection-purpose';

// Mesma rota/URL de sempre (é o redirect_uri já configurado no Partner
// Center — TikTok Shop não aceita um redirect_uri por requisição, só o fixo
// do app) — sem `?purpose=`, comporta-se exatamente como antes
// ('bestsellers_sync'). "Minha loja" usa `?purpose=own_shop`; o propósito
// vai num segundo cookie (não dá pra embutir no `state` sem mudar o que o
// callback compara byte a byte contra o cookie de state).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  const purpose = parseConnectionPurpose(new URL(request.url).searchParams.get('purpose'));
  const state = createOAuthState();
  const response = NextResponse.redirect(createSellerAuthorizationUrl(getTikTokConfig(), state));
  const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: 600, path: '/' };
  response.cookies.set('tiktok_oauth_state', state, cookieOpts);
  response.cookies.set('tiktok_oauth_purpose', purpose, cookieOpts);
  response.headers.set('cache-control', 'no-store');
  return response;
}
