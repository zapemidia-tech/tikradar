import { describe, it, expect } from 'vitest';
import { TikTokShopClient } from '@/lib/tiktok/client';
import { TikTokApiError } from '@/lib/tiktok/errors';
import { fetchOwnShopProducts, fetchOwnShopVideos } from '@/services/tiktok/shop-dashboard-service';
import { SHOP_DASHBOARD_MAX_PAGES } from '@/lib/tiktok/shop-analytics';

// Serviço EXCLUSIVO de app/minha-loja — sempre versão 202605, nunca cai pra
// 202509 (diferente do diagnóstico). Fixtures abaixo cobrem: dados reais
// presentes, a resposta vazia REAL da sandbox (confirmada em produção em
// 2026-09-14 — chave omitida, total_count:0, sem next_page_token — ver
// docs/tiktok-shop-analytics-202605.md), erro de negócio nunca virando lista
// vazia, e o limite de páginas nunca virando uma varredura completa.

function fakeClient(behavior: (path: string, query: Record<string, unknown>) => unknown) {
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
  (client as unknown as { request: (path: string, query: Record<string, unknown>) => Promise<unknown> }).request = async (path, query) => behavior(path, query);
  return client;
}

const params = { startDateGe: '2026-09-01', endDateLt: '2026-09-08', pageSize: 100 };

describe('fetchOwnShopVideos', () => {
  it('dados reais presentes: success_with_data, item normalizado, versão 202605 sempre', async () => {
    const client = fakeClient(() => ({
      code: 0,
      message: 'Success',
      request_id: 'r1',
      data: {
        videos: [
          {
            id: '1',
            title: 'Vídeo real',
            username: 'loja01',
            creator: { open_id: 'o1', user_name: 'loja01', nick_name: 'Loja 01', author_type: 'OFFICIAL' },
            video_post_time: '2026-09-05 10:00:00',
            duration: 30,
            hash_tags: ['#promo'],
            gmv: { amount: '100.00', currency: 'BRL' },
            gpm: { amount: '10.00', currency: 'BRL' },
            avg_customers: 5,
            sku_orders: 3,
            items_sold: 4,
            views: 1000,
            click_through_rate: '0.05',
            products: [{ id: 'p1', name: 'Produto 1' }],
          },
        ],
        total_count: 1,
        next_page_token: '',
        latest_available_date: '2026-09-07',
      },
    }));

    const result = await fetchOwnShopVideos(client, params);
    expect(result.outcome).toBe('success_with_data');
    if (result.outcome === 'success_with_data' || result.outcome === 'success_empty') {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ id: '1', title: 'Vídeo real', version: '202605', creator: { nickName: 'Loja 01' } });
      expect(result.latestAvailableDate).toBe('2026-09-07');
      expect(result.truncatedByPageLimit).toBe(false);
    }
  });

  it('resposta vazia REAL da sandbox (chave omitida, total_count:0, sem next_page_token) -> success_empty, nunca formato inesperado', async () => {
    const client = fakeClient(() => ({
      code: 0,
      message: 'Success',
      request_id: 'r2',
      data: { total_count: 0, next_page_token: '', latest_available_date: '2026-09-12' },
    }));

    const result = await fetchOwnShopVideos(client, params);
    expect(result.outcome).toBe('success_empty');
    if (result.outcome === 'success_with_data' || result.outcome === 'success_empty') {
      expect(result.items).toEqual([]);
      expect(result.latestAvailableDate).toBe('2026-09-12');
    }
  });

  it('erro de negócio (permissão insuficiente) nunca vira lista vazia — propaga classificado', async () => {
    const client = fakeClient(() => {
      throw new TikTokApiError('Access denied. The app is not authorized to access this api.', 403, 105005, 'r3');
    });

    const result = await fetchOwnShopVideos(client, params);
    expect(result.outcome).toBe('insufficient_permission');
    expect('items' in result).toBe(false);
  });

  it('respeita SHOP_DASHBOARD_MAX_PAGES — nunca vira uma varredura completa mesmo com mais páginas disponíveis', async () => {
    let calls = 0;
    const client = fakeClient(() => {
      calls++;
      return {
        code: 0,
        data: { videos: [{ id: String(calls) }], total_count: 9999, next_page_token: 'sempre-tem-mais', latest_available_date: '2026-09-07' },
      };
    });

    const result = await fetchOwnShopVideos(client, params);
    expect(calls).toBe(SHOP_DASHBOARD_MAX_PAGES);
    if (result.outcome === 'success_with_data' || result.outcome === 'success_empty') {
      expect(result.pagesFetched).toBe(SHOP_DASHBOARD_MAX_PAGES);
      expect(result.truncatedByPageLimit).toBe(true);
      expect(result.itemCount).toBe(SHOP_DASHBOARD_MAX_PAGES);
    }
  });
});

describe('fetchOwnShopProducts', () => {
  it('dados reais presentes: success_with_data, canais extraídos', async () => {
    const client = fakeClient(() => ({
      code: 0,
      message: 'Success',
      request_id: 'r4',
      data: {
        products: [
          {
            id: 'p1',
            total_performance: { gmv: { amount: '50.00', currency: 'BRL' }, orders: 2, items_sold: 2 },
            seller_live_performance: { attributed_gmv: { amount: '10.00', currency: 'BRL' }, attributed_orders: 1 },
          },
        ],
        total_count: 1,
        next_page_token: '',
        latest_available_date: '2026-09-07',
      },
    }));

    const result = await fetchOwnShopProducts(client, params);
    expect(result.outcome).toBe('success_with_data');
    if (result.outcome === 'success_with_data' || result.outcome === 'success_empty') {
      expect(result.items[0]).toMatchObject({ id: 'p1', version: '202605' });
      if (result.items[0].version === '202605') {
        expect(result.items[0].channels).toHaveLength(1);
        expect(result.items[0].channels[0]).toMatchObject({ channel: 'seller_live_performance', attributedOrders: 1 });
      }
    }
  });

  it('resposta vazia REAL da sandbox (chave products omitida) -> success_empty', async () => {
    const client = fakeClient(() => ({
      code: 0,
      message: 'Success',
      request_id: 'r5',
      data: { total_count: 0, next_page_token: '', latest_available_date: '2026-09-12' },
    }));

    const result = await fetchOwnShopProducts(client, params);
    expect(result.outcome).toBe('success_empty');
  });

  it('formato realmente inesperado (chave ausente MAS total_count>0) continua erro — nunca descarta produtos que a TikTok diz existir', async () => {
    const client = fakeClient(() => ({ code: 0, data: { total_count: 3 } }));
    const result = await fetchOwnShopProducts(client, params);
    expect(result.outcome).toBe('unexpected_format');
  });
});
