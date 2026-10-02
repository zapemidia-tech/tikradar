import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { createCreatorAuthorizationUrl } from '@/lib/tiktok/creator-auth';
import { getTikTokCreatorConfig } from '@/lib/tiktok/creator-config';
import { createOAuthState } from '@/lib/tiktok/oauth-state';
import { describeUnknownError } from '@/lib/tiktok/errors';

// Fluxo OAuth SEPARADO do seller (/api/tiktok/oauth/authorize) — rota
// própria, cookie de state próprio (`tiktok_creator_oauth_state`, nunca
// `tiktok_oauth_state` do seller), credenciais do app de criador
// (TIKTOK_CREATOR_APP_KEY/SECRET, ver lib/tiktok/creator-config.ts). Nunca
// aceita `?purpose=` — sempre e só 'affiliate_creator'.
export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });

  const config = getTikTokCreatorConfig(process.env);
  let authorizationUrl: string;
  try {
    // `state` gerado ANTES de qualquer resposta — se a URL de autorização
    // falhar (app não configurado), nenhum cookie é setado.
    authorizationUrl = createCreatorAuthorizationUrl(config, createOAuthState());
  } catch (error) {
    return NextResponse.json({ error: describeUnknownError(error) }, { status: 503 });
  }

  // O `state` usado na URL acima precisa ser o MESMO salvo no cookie — extrai de volta em vez de gerar 2x.
  const state = new URL(authorizationUrl).searchParams.get('state')!;
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set('tiktok_creator_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  response.headers.set('cache-control', 'no-store');
  return response;
}
