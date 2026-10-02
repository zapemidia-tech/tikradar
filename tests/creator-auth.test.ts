import { describe, it, expect, vi } from 'vitest';
import { createCreatorAuthorizationUrl, exchangeCreatorAuthorizationCode } from '@/lib/tiktok/creator-auth';
import { TikTokConfigError, TikTokAuthError } from '@/lib/tiktok/errors';
import type { TikTokCreatorConfig } from '@/lib/tiktok/creator-config';

const config: TikTokCreatorConfig = {
  apiBaseUrl: 'https://example.com',
  authBaseUrl: 'https://example.com',
  creatorAuthorizeUrl: 'https://shop.tiktok.com/alliance/creator/auth',
  appKey: 'creator-app-key',
  appSecret: 'creator-app-secret',
  isProduction: false,
};

describe('createCreatorAuthorizationUrl', () => {
  it('usa o endpoint oficial de criador (shop.tiktok.com/alliance/creator/auth), nunca o de seller', () => {
    const url = createCreatorAuthorizationUrl(config, 'state123');
    expect(url.startsWith('https://shop.tiktok.com/alliance/creator/auth?')).toBe(true);
  });

  it('inclui app_key e state — state é OBRIGATÓRIO no link de criador (diferente do seller, onde é opcional)', () => {
    const url = new URL(createCreatorAuthorizationUrl(config, 'state123'));
    expect(url.searchParams.get('app_key')).toBe('creator-app-key');
    expect(url.searchParams.get('state')).toBe('state123');
  });

  it('nunca inclui service_id (parâmetro do fluxo seller, não existe no de criador)', () => {
    const url = new URL(createCreatorAuthorizationUrl(config, 'state123'));
    expect(url.searchParams.has('service_id')).toBe(false);
  });

  it('sem app_key configurado, lança TikTokConfigError — nunca gera uma URL quebrada', () => {
    expect(() => createCreatorAuthorizationUrl({ ...config, appKey: undefined }, 'state123')).toThrow(TikTokConfigError);
  });
});

describe('exchangeCreatorAuthorizationCode', () => {
  it('troca o código corretamente e aceita user_type=1 (criador)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/api/v2/token/get');
      expect(url.searchParams.get('app_key')).toBe('creator-app-key');
      expect(url.searchParams.get('app_secret')).toBe('creator-app-secret');
      expect(url.searchParams.get('auth_code')).toBe('code123');
      expect(url.searchParams.get('grant_type')).toBe('authorized_code');
      return new Response(
        JSON.stringify({
          code: 0,
          message: 'Success',
          request_id: 'r1',
          data: {
            access_token: 'at1',
            access_token_expire_in: 86400,
            refresh_token: 'rt1',
            refresh_token_expire_in: 2592000,
            open_id: 'open1',
            user_type: 1,
            granted_scopes: ['creator.affiliate.info'],
          },
        }),
        { status: 200 },
      );
    });

    const tokens = await exchangeCreatorAuthorizationCode(config, 'code123');
    expect(tokens).toMatchObject({ accessToken: 'at1', refreshToken: 'rt1', openId: 'open1', userType: 1, grantedScopes: ['creator.affiliate.info'] });
    fetchSpy.mockRestore();
  });

  it('code !== 0 na resposta -> TikTokAuthError, nunca retorna tokens parciais', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 36001, message: 'invalid auth_code' }), { status: 200 }));
    await expect(exchangeCreatorAuthorizationCode(config, 'code-ruim')).rejects.toThrow(TikTokAuthError);
    fetchSpy.mockRestore();
  });

  it('resposta malformada (campos obrigatórios ausentes) -> TikTokAuthError, nunca aceita parcialmente', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { access_token: 'at1' } }), { status: 200 }));
    await expect(exchangeCreatorAuthorizationCode(config, 'code123')).rejects.toThrow(TikTokAuthError);
    fetchSpy.mockRestore();
  });
});
