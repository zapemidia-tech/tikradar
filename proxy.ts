import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveAccess } from '@/lib/auth/route-access';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname, search } = request.nextUrl;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // Supabase não configurado. Em produção, protege as rotas privadas mesmo
    // assim (fail-safe). Em desenvolvimento, segue com dados demonstrativos.
    if (process.env.NODE_ENV === 'production') {
      const decision = resolveAccess({ pathname, search, isAuthenticated: false });
      if (decision.action === 'redirect') {
        return NextResponse.redirect(new URL(decision.to, request.url));
      }
    }
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Valida a sessão no servidor (não confia em localStorage).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = resolveAccess({ pathname, search, isAuthenticated: Boolean(user) });
  if (decision.action === 'redirect') {
    const redirectResponse = NextResponse.redirect(new URL(decision.to, request.url));
    // Mantém os cookies de sessão renovados no redirecionamento.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)'],
};
