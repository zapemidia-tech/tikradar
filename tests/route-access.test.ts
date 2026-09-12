import { describe, it, expect } from 'vitest';
import {
  resolveAccess,
  resolveAdminAccess,
  isProtectedPath,
  isAdminPath,
} from '@/lib/auth/route-access';

describe('rotas públicas', () => {
  for (const pathname of ['/', '/login', '/privacy', '/security', '/data-requests', '/forgot-password', '/reset-password']) {
    it(`${pathname} abre sem login`, () => {
      expect(resolveAccess({ pathname, isAuthenticated: false })).toEqual({ action: 'allow' });
    });
  }
});

describe('rotas protegidas', () => {
  it('/dashboard manda visitante para /login preservando o destino', () => {
    expect(resolveAccess({ pathname: '/dashboard', isAuthenticated: false })).toEqual({
      action: 'redirect',
      to: '/login?next=%2Fdashboard',
    });
  });

  it('preserva a URL originalmente solicitada (com query)', () => {
    expect(resolveAccess({ pathname: '/products', search: '?id=42', isAuthenticated: false })).toEqual({
      action: 'redirect',
      to: '/login?next=%2Fproducts%3Fid%3D42',
    });
  });

  it('libera rota protegida para usuário autenticado', () => {
    expect(resolveAccess({ pathname: '/dashboard', isAuthenticated: true })).toEqual({ action: 'allow' });
    expect(resolveAccess({ pathname: '/admin', isAuthenticated: true })).toEqual({ action: 'allow' });
  });

  it('usuário autenticado em /login vai para /dashboard', () => {
    expect(resolveAccess({ pathname: '/login', isAuthenticated: true })).toEqual({
      action: 'redirect',
      to: '/dashboard',
    });
  });

  it('não interfere em /api', () => {
    expect(resolveAccess({ pathname: '/api/auth/me', isAuthenticated: false })).toEqual({ action: 'allow' });
  });

  it('classificadores de prefixo', () => {
    expect(isProtectedPath('/settings')).toBe(true);
    expect(isProtectedPath('/privacy')).toBe(false);
    expect(isAdminPath('/admin/integrations/tiktok')).toBe(true);
    expect(isAdminPath('/dashboard')).toBe(false);
  });

  it('/new-in-radar exige sessão, igual às demais páginas de dados', () => {
    expect(resolveAccess({ pathname: '/new-in-radar', isAuthenticated: false })).toEqual({
      action: 'redirect',
      to: '/login?next=%2Fnew-in-radar',
    });
    expect(resolveAccess({ pathname: '/new-in-radar', isAuthenticated: true })).toEqual({ action: 'allow' });
    expect(isProtectedPath('/new-in-radar')).toBe(true);
  });
});

describe('acesso admin (servidor)', () => {
  it('visitante -> login', () => {
    expect(resolveAdminAccess({ isAuthenticated: false, role: null })).toBe('redirect-login');
  });
  it('usuário comum é bloqueado -> dashboard', () => {
    expect(resolveAdminAccess({ isAuthenticated: true, role: 'user' })).toBe('redirect-dashboard');
  });
  it('administrador acessa', () => {
    expect(resolveAdminAccess({ isAuthenticated: true, role: 'admin' })).toBe('allow');
  });
});
