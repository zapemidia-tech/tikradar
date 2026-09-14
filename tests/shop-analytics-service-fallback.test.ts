import { describe, it, expect } from 'vitest';
import { TikTokShopClient } from '@/lib/tiktok/client';
import { TikTokApiError } from '@/lib/tiktok/errors';
import { fetchFirstShopProductPageWithFallback, fetchFirstShopVideoPageWithFallback, SHOP_ANALYTICS_VERSION_PREFERENCE } from '@/services/tiktok/shop-analytics-service';
import { SHOP_PRODUCT_PERFORMANCE_PATH, SHOP_VIDEO_PERFORMANCE_PATH } from '@/lib/tiktok/shop-analytics';

// `TikTokShopClient.request` é o único ponto que toca rede (services/tiktok/
// shop-analytics-service.ts chama ele diretamente) — trocá-lo por um fake é
// o bastante pra testar o fallback de versão sem mockar fetch/HTTP.
function fakeClient(behavior: (path: string) => unknown) {
  const client = new TikTokShopClient({
    provider: 'tiktok',
    apiBaseUrl: 'https://example.com',
    authBaseUrl: 'https://example.com',
    authorizeUrl: 'https://example.com',
    appKey: 'k',
    appSecret: 's',
    region: 'BR',
    currency: 'LOCAL',
    accessToken: 'token',
    shopCipher: 'cipher',
    isProduction: false,
  });
  (client as unknown as { request: (path: string) => Promise<unknown> }).request = async (path: string) => behavior(path);
  return client;
}

const window = { startDateGe: '2026-09-01', endDateLt: '2026-09-08' };

describe('fetchFirstShopVideoPageWithFallback — 202605 primeiro, 202509 só se a TikTok disser que a versão não existe', () => {
  it('202605 responde normalmente: usa 202605, nunca chama 202509', async () => {
    const calls: string[] = [];
    const client = fakeClient((path) => {
      calls.push(path);
      return { code: 0, message: 'Success', data: { videos: [{ id: '1' }], total_count: 1, next_page_token: '', latest_available_date: '2026-09-06' } };
    });
    const result = await fetchFirstShopVideoPageWithFallback(client, window);
    expect(result.version).toBe('202605');
    expect(calls).toEqual([SHOP_VIDEO_PERFORMANCE_PATH['202605']]);
  });

  it('202605 indisponível pra este app (36009009 Invalid path): cai pra 202509 automaticamente', async () => {
    const calls: string[] = [];
    const client = fakeClient((path) => {
      calls.push(path);
      if (path === SHOP_VIDEO_PERFORMANCE_PATH['202605']) {
        throw new TikTokApiError('Invalid path. The specified path does not match any available endpoint.', 404, 36009009, 'r1');
      }
      return { code: 0, message: 'Success', data: { videos: [{ id: '1' }], total_count: 1, next_page_token: '', latest_available_date: '2026-09-06' } };
    });
    const result = await fetchFirstShopVideoPageWithFallback(client, window);
    expect(result.version).toBe('202509');
    expect(calls).toEqual([SHOP_VIDEO_PERFORMANCE_PATH['202605'], SHOP_VIDEO_PERFORMANCE_PATH['202509']]);
  });

  it('erro de negócio (período inválido) NUNCA aciona o fallback — propaga na hora, sem tentar 202509', async () => {
    const calls: string[] = [];
    const client = fakeClient((path) => {
      calls.push(path);
      throw new TikTokApiError('invalid request params; detail: start time or end time is invalid.', 400, 28001022, 'r2');
    });
    await expect(fetchFirstShopVideoPageWithFallback(client, window)).rejects.toThrow(/start time or end time/);
    expect(calls).toEqual([SHOP_VIDEO_PERFORMANCE_PATH['202605']]); // só tentou uma vez — não é problema de versão
  });

  it('nenhuma das duas versões disponível: propaga o erro da última tentativa (202509)', async () => {
    const client = fakeClient(() => {
      throw new TikTokApiError('Invalid path. The specified path does not match any available endpoint.', 404, 36009009, 'r3');
    });
    await expect(fetchFirstShopVideoPageWithFallback(client, window)).rejects.toThrow(/Invalid path/);
  });
});

describe('fetchFirstShopProductPageWithFallback — mesmo comportamento pra produtos', () => {
  it('202605 indisponível: cai pra 202509', async () => {
    const calls: string[] = [];
    const client = fakeClient((path) => {
      calls.push(path);
      if (path === SHOP_PRODUCT_PERFORMANCE_PATH['202605']) {
        throw new TikTokApiError('Invalid API version. The version value is invalid or unsupported.', 400, 36009014, 'r4');
      }
      return { code: 0, message: 'Success', data: { products: [{ id: '1' }], total_count: 1, next_page_token: '', latest_available_date: '2026-09-06' } };
    });
    const result = await fetchFirstShopProductPageWithFallback(client, window);
    expect(result.version).toBe('202509');
    expect(calls).toEqual([SHOP_PRODUCT_PERFORMANCE_PATH['202605'], SHOP_PRODUCT_PERFORMANCE_PATH['202509']]);
  });
});

describe('SHOP_ANALYTICS_VERSION_PREFERENCE', () => {
  it('202605 antes de 202509 — prioridade explícita pedida (mais completo primeiro)', () => {
    expect(SHOP_ANALYTICS_VERSION_PREFERENCE).toEqual(['202605', '202509']);
  });
});
