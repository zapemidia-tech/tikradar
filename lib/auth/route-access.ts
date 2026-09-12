// Regras puras de acesso a rotas. Usadas pelo proxy (middleware) e testáveis
// isoladamente. Nada aqui toca em rede, cookies ou banco.

import { loginPathWithNext } from './safe-next';

export type Role = 'user' | 'admin' | null;

/** Rotas públicas exatas (sem exigir sessão). */
export const PUBLIC_PATHS: readonly string[] = [
  '/',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/privacy',
  '/security',
  '/data-requests',
  '/auth/callback',
];

/** Rotas de autenticação: se já houver sessão, manda para o dashboard. */
export const AUTH_ONLY_WHEN_LOGGED_OUT: readonly string[] = ['/login', '/forgot-password'];

/** Prefixos que exigem sessão válida. */
export const PROTECTED_PREFIXES: readonly string[] = [
  '/dashboard',
  '/admin',
  '/products',
  '/radar',
  '/new-in-radar',
  '/creators',
  '/shops',
  '/videos',
  '/categories',
  '/favorites',
  '/alerts',
  '/settings',
];

/** Prefixos que, além de sessão, exigem papel admin (checado no servidor). */
export const ADMIN_PREFIXES: readonly string[] = ['/admin'];

const DASHBOARD = '/dashboard';
const LOGIN = '/login';

function hasPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isProtectedPath(pathname: string): boolean {
  return hasPrefix(pathname, PROTECTED_PREFIXES);
}

export function isAdminPath(pathname: string): boolean {
  return hasPrefix(pathname, ADMIN_PREFIXES);
}

export type AccessDecision =
  | { action: 'allow' }
  | { action: 'redirect'; to: string };

/**
 * Decide o que o middleware deve fazer para uma navegação de página.
 * A verificação fina de papel admin acontece no layout server de `/admin`;
 * aqui o admin só precisa estar autenticado.
 */
export function resolveAccess(input: {
  pathname: string;
  search?: string;
  isAuthenticated: boolean;
}): AccessDecision {
  const { pathname, search = '', isAuthenticated } = input;

  // Nunca interfere em assets internos ou rotas de API (que se protegem sozinhas).
  if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return { action: 'allow' };
  }

  if (isAuthenticated && AUTH_ONLY_WHEN_LOGGED_OUT.includes(pathname)) {
    return { action: 'redirect', to: DASHBOARD };
  }

  if (!isAuthenticated && isProtectedPath(pathname)) {
    return { action: 'redirect', to: loginPathWithNext(`${pathname}${search}`, LOGIN) };
  }

  return { action: 'allow' };
}

/** Regra pura para o servidor decidir o acesso a `/admin`. */
export function resolveAdminAccess(input: {
  isAuthenticated: boolean;
  role: Role;
}): 'allow' | 'redirect-login' | 'redirect-dashboard' {
  if (!input.isAuthenticated) return 'redirect-login';
  return input.role === 'admin' ? 'allow' : 'redirect-dashboard';
}
