import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeNext } from '@/lib/auth/safe-next';

// Callback de autenticação por link (recuperação de senha / convite).
// Troca o código PKCE (ou token_hash) por uma sessão em cookies HTTP e
// redireciona para um destino interno validado.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = sanitizeNext(url.searchParams.get('next'), '/reset-password');

  const expired = NextResponse.redirect(new URL('/reset-password?error=expired', url.origin));
  expired.headers.set('cache-control', 'no-store');

  let supabase;
  try {
    supabase = await getSupabaseServerClient();
  } catch {
    return expired;
  }

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return expired;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) return expired;
    } else {
      return expired;
    }
  } catch {
    return expired;
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  response.headers.set('cache-control', 'no-store');
  return response;
}
