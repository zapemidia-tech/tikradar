import { describe, it, expect } from 'vitest';
import { isSafeNextPath, sanitizeNext, loginPathWithNext } from '@/lib/auth/safe-next';

describe('safe-next', () => {
  it('aceita caminhos internos', () => {
    expect(isSafeNextPath('/dashboard')).toBe(true);
    expect(isSafeNextPath('/admin/integrations/tiktok')).toBe(true);
    expect(isSafeNextPath('/products?id=1&sort=asc')).toBe(true);
  });

  it('rejeita redirecionamento aberto para domínio externo', () => {
    for (const value of [
      'https://evil.com',
      'http://evil.com/x',
      '//evil.com',
      '/\\evil.com',
      '\\/evil.com',
      'https:/evil.com',
      'javascript:alert(1)',
      'evil.com',
      '/path\nSet-Cookie: x',
      '  /dashboard',
      '',
      42 as unknown,
      null,
    ]) {
      expect(isSafeNextPath(value)).toBe(false);
    }
  });

  it('sanitizeNext cai no padrão /dashboard quando inseguro', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/dashboard');
    expect(sanitizeNext('//evil.com')).toBe('/dashboard');
    expect(sanitizeNext(undefined)).toBe('/dashboard');
    expect(sanitizeNext('/radar')).toBe('/radar');
  });

  it('loginPathWithNext só anexa next interno', () => {
    expect(loginPathWithNext('/admin')).toBe('/login?next=%2Fadmin');
    expect(loginPathWithNext('/dashboard')).toBe('/login?next=%2Fdashboard');
    expect(loginPathWithNext('https://evil.com')).toBe('/login');
    expect(loginPathWithNext('//evil.com')).toBe('/login');
  });
});
