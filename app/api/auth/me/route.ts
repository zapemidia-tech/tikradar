import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';

// Identidade mínima da sessão para a UI (nome exibido + papel).
// Não retorna tokens, e-mails de terceiros nem segredos.
export async function GET() {
  const profile = await getSessionProfile();
  const headers = { 'cache-control': 'no-store' };

  if (!profile) {
    return NextResponse.json({ authenticated: false }, { headers });
  }

  return NextResponse.json(
    {
      authenticated: true,
      displayName: profile.displayName,
      email: profile.email,
      role: profile.role,
    },
    { headers },
  );
}
