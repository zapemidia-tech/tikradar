import { describe, it, expect, vi } from 'vitest';
import { getTikTokCreatorConfig } from '@/lib/tiktok/creator-config';
import { getTikTokConfig } from '@/lib/tiktok/config';

// Confirma 2 garantias de isolamento pedidas na Seção 11/12:
// (1) o app de criador NUNCA lê as variáveis do app seller como fallback,
//     e vice-versa — mesmo quando só uma das duas está definida;
// (2) as 3 conexões (bestsellers_sync/own_shop/affiliate_creator) nunca se
//     misturam na leitura do Supabase (coberto separadamente em
//     tests/token-store-isolation.test.ts, que já prova o filtro por
//     platform_user_id + connection_purpose — este arquivo foca na camada
//     de CREDENCIAIS DE APP, que é específica desta tarefa).

describe('getTikTokCreatorConfig — nunca usa fallback das credenciais do app seller', () => {
  it('só TIKTOK_SHOP_APP_KEY/SECRET definidos (app seller) -> creator config fica vazio, nunca herda', () => {
    const env = { TIKTOK_SHOP_APP_KEY: 'seller-key', TIKTOK_SHOP_APP_SECRET: 'seller-secret' } as unknown as NodeJS.ProcessEnv;
    const creatorConfig = getTikTokCreatorConfig(env);
    expect(creatorConfig.appKey).toBeUndefined();
    expect(creatorConfig.appSecret).toBeUndefined();
  });

  it('com TIKTOK_CREATOR_APP_KEY/SECRET definidos, usa exatamente esses valores — nunca mistura com os do seller mesmo quando ambos existem', () => {
    const env = {
      TIKTOK_SHOP_APP_KEY: 'seller-key',
      TIKTOK_SHOP_APP_SECRET: 'seller-secret',
      TIKTOK_CREATOR_APP_KEY: 'creator-key',
      TIKTOK_CREATOR_APP_SECRET: 'creator-secret',
    } as unknown as NodeJS.ProcessEnv;
    const creatorConfig = getTikTokCreatorConfig(env);
    expect(creatorConfig.appKey).toBe('creator-key');
    expect(creatorConfig.appSecret).toBe('creator-secret');
  });
});

describe('getTikTokConfig (seller) — nunca usa fallback das credenciais do app de criador', () => {
  it('só TIKTOK_CREATOR_APP_KEY/SECRET definidos -> config do seller fica vazio, nunca herda', () => {
    const env = { TIKTOK_CREATOR_APP_KEY: 'creator-key', TIKTOK_CREATOR_APP_SECRET: 'creator-secret' } as unknown as NodeJS.ProcessEnv;
    const sellerConfig = getTikTokConfig(env);
    expect(sellerConfig.appKey).toBeUndefined();
    expect(sellerConfig.appSecret).toBeUndefined();
  });
});

describe('TikTokCreatorClient — nunca envia shop_cipher (criador não tem loja) e sempre usa o app key de criador', () => {
  it('a URL assinada nunca contém shop_cipher, e usa o app_key passado na config (nunca um valor fixo/seller)', async () => {
    const { TikTokCreatorClient } = await import('@/lib/tiktok/creator-client');
    const config = {
      apiBaseUrl: 'https://example.com',
      authBaseUrl: 'https://example.com',
      creatorAuthorizeUrl: 'https://example.com/auth',
      appKey: 'creator-key-xyz',
      appSecret: 'creator-secret-xyz',
      isProduction: false,
    };
    let capturedUrl: URL | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      capturedUrl = new URL(String(input));
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 });
    });

    const client = new TikTokCreatorClient(config, 'creator-access-token-xyz');
    await client.request('/affiliate_creator/202508/profiles', {});

    expect(capturedUrl?.searchParams.get('shop_cipher')).toBeNull();
    expect(capturedUrl?.searchParams.get('app_key')).toBe('creator-key-xyz');
    expect(capturedHeaders?.['x-tts-access-token']).toBe('creator-access-token-xyz');

    fetchSpy.mockRestore();
  });
});
