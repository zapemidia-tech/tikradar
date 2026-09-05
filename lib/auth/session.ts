import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { loginPathWithNext, sanitizeNext } from '@/lib/auth/safe-next';
import { resolveAdminAccess, type Role } from '@/lib/auth/route-access';

export type SessionUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export type SessionProfile = SessionUser & { role: Role };

const SIGN_IN_PATH = '/login';
const DASHBOARD_PATH = '/dashboard';

export async function getSessionUser(): Promise<SessionUser | null> {
  let supabase;
  try {
    supabase = await getSupabaseServerClient();
  } catch {
    return null;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;

  const fullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;

  return {
    userId: user.id,
    displayName: fullName ?? user.email,
    email: user.email,
    fullName,
  };
}

/** Sessão + papel (lido de `public.profiles` via RLS: cada um lê só o próprio). */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;

  let role: Role = 'user';
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.userId)
      .maybeSingle();
    if (data?.role === 'admin' || data?.role === 'user') role = data.role;
  } catch {
    role = 'user';
  }

  return { ...user, role };
}

export async function requireSessionUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;
  redirect(signInPath(returnTo));
}

/** Garante sessão E papel admin. Não confia em nada vindo do cliente. */
export async function requireAdmin(returnTo: string): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  const decision = resolveAdminAccess({
    isAuthenticated: Boolean(profile),
    role: profile?.role ?? null,
  });

  if (decision === 'allow') return profile as SessionProfile;
  if (decision === 'redirect-login') redirect(signInPath(returnTo));
  redirect(DASHBOARD_PATH);
}

/** `/login?next=<destino interno seguro>` (protege contra open redirect). */
export function signInPath(returnTo: string): string {
  return loginPathWithNext(sanitizeNext(returnTo), SIGN_IN_PATH);
}
