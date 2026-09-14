import { describe, it, expect } from 'vitest';
import {
  parseAnalyticsPage,
  toVideoSummary,
  toProductSummary,
  classifyShopAnalyticsError,
  isVersionUnavailableError,
  collectPaginated,
  DIAGNOSTIC_MAX_PAGES,
  type AnalyticsPage,
} from '@/lib/tiktok/shop-analytics';
import { defaultAnalyticsWindow } from '@/lib/tiktok/shop-analytics-window';
import { TikTokApiError } from '@/lib/tiktok/errors';

// Exemplos REAIS de resposta, baixados via "Download Markdown" (texto
// completo, sem o corte que o editor de código renderizado em JS causa) das
// páginas oficiais em 2026-09-14. Nunca inventados.
//
//   video 202509: get-shop-video-performance-list-202509
//   video 202605: get-shop-video-performance-list-202605
//   product 202509: get-shop-product-performance-list-202509
//   product 202605: get-shop-product-performance-list-202605

const REAL_VIDEO_202509 = {
  code: 0,
  message: 'Success',
  request_id: '202203070749000101890810281E8C70B7',
  data: {
    videos: [
      {
        id: '172xxxxxxxxxxxxx089',
        title: 'Video Title',
        username: 'Video Username',
        video_post_time: '2025-01-01 00:00:00',
        duration: 34,
        hash_tags: ['#racuntiktok', 'fyp'],
        gmv: { amount: '246.80', currency: 'USD' },
        gpm: { amount: '18.75', currency: 'USD' },
        avg_customers: 0,
        sku_orders: 0,
        items_sold: 0,
        views: 0,
        click_through_rate: '12.5%',
        products: [{ id: '105xxxxxxxxxxxxx247', name: 'Product Name' }],
      },
    ],
    latest_available_date: '2024-09-07',
    next_page_token: 'cGFnZV9udW1iZXI9MQ==',
    total_count: 10,
  },
};

const REAL_VIDEO_202605 = {
  code: 0,
  message: 'Success',
  request_id: '202203070749000101890810281E8C70B7',
  data: {
    videos: [
      {
        id: '172xxxxxxxxxxxxx089',
        title: 'How to Style Summer Outfits',
        username: 'creator_shop_01',
        creator: {
          open_id: 'uACafQAAAABmUU2qon4R0vUYvUVS3QC6CICP2m5A2-wd77j8R9G0yg',
          user_name: 'creator_shop_01',
          nick_name: 'abc_bec',
          author_type: 'OFFICIAL',
        },
        video_post_time: '2025-01-01 00:00:00',
        duration: 34,
        hash_tags: ['#racuntiktok', 'fyp'],
        gmv: { amount: '125.50', currency: 'USD' },
        gpm: { amount: '32.40', currency: 'USD' },
        avg_customers: 35,
        sku_orders: 12,
        items_sold: 18,
        views: 1200,
        click_through_rate: '0.0528',
        products: [{ id: '105xxxxxxxxxxxxx247', name: 'Wireless Earbuds' }],
      },
    ],
    latest_available_date: '2024-09-07',
    next_page_token: 'cGFnZV9udW1iZXI9MQ==',
    total_count: 10,
  },
};

const REAL_PRODUCT_202509 = {
  code: 0,
  message: 'Success',
  request_id: '202203070749000101890810281E8C70B7',
  data: {
    products: [
      {
        id: '1732333333333333629',
        overall_performance: {
          gmv: { amount: '395.03', currency: 'GBP' },
          items_sold: 12,
          orders: 12,
        },
      },
    ],
    next_page_token: 'cGFnZV9udW1iZXI9MQ==',
    total_count: 10,
    latest_available_date: '2024-04-07',
  },
};

const REAL_PRODUCT_202605 = {
  code: 0,
  message: 'Success',
  request_id: '202203070749000101890810281E8C70B7',
  data: {
    products: [
      {
        id: '1732333333333333629',
        total_performance: {
          gmv: { amount: '395.03', currency: 'GBP' },
          orders: 12,
          sku_orders: 12,
          items_sold: 12,
          estimated_customers: 10,
          aov: { amount: '32.92', currency: 'GBP' },
          product_impressions: 5420,
          product_clicks: 438,
          ctr: '0.0808',
          add_cart_count: 57,
          add_cart_rate: '0.1301',
          click_order_rate: '0.0274',
          unique_product_impressions: 4890,
          unique_clicks: 401,
          unique_ctr: '0.082',
          add_cart_users: 45,
          unique_atc_rate: '0.1122',
          unique_click_order_rate: '0.0299',
          gmv_incl_tax: { amount: '426.63', currency: 'GBP' },
          tax: { amount: '31.6', currency: 'GBP' },
          gross_merchandise_value: { amount: '395.03', currency: 'GBP' },
          shipping_fees: { amount: '18.5', currency: 'GBP' },
          refunds: { amount: '24.99', currency: 'GBP' },
          refunded_items: 1,
          refund_customers: 1,
        },
        seller_live_performance: { attributed_gmv: { amount: '142.8', currency: 'GBP' }, attributed_orders: 4 },
        seller_video_performance: { attributed_gmv: { amount: '96.45', currency: 'GBP' }, attributed_orders: 3 },
        seller_product_card_performance: { attributed_gmv: { amount: '118.6', currency: 'GBP' }, attributed_orders: 4 },
        affiliate_total_performance: { attributed_gmv: { amount: '204.3', currency: 'GBP' }, attributed_orders: 6 },
        affiliate_live_performance: { live_attributed_gmv: { amount: '121.4', currency: 'GBP' }, new_live_count: 3 },
        affiliate_video_performance: { attributed_video_gmv: { amount: '82.9', currency: 'GBP' }, new_video_count: 5 },
        shop_tab_performance: { shop_tab_product_impressions: 2520, shop_tab_gmv: { amount: '128.4', currency: 'GBP' } },
      },
    ],
    next_page_token: 'cGFnZV9udW1iZXI9MQ==',
    total_count: 10,
    latest_available_date: '2024-04-07',
  },
};

describe('parseAnalyticsPage — mesma extração de página em qualquer versão', () => {
  it('202509 e 202605 de vídeo têm a mesma forma de página (o que muda é o item)', () => {
    for (const [resp, expectedCtr] of [
      [REAL_VIDEO_202509, '12.5%'],
      [REAL_VIDEO_202605, '0.0528'],
    ] as const) {
      const page = parseAnalyticsPage(resp, 'videos');
      expect(page).not.toBeNull();
      expect(page!.items).toHaveLength(1);
      expect(page!.totalCount).toBe(10);
      expect(page!.nextPageToken).toBe('cGFnZV9udW1iZXI9MQ==');
      expect(page!.items[0].click_through_rate).toBe(expectedCtr);
    }
  });

  it('resposta sem lista (formato inesperado) retorna null, nunca finge sucesso', () => {
    expect(parseAnalyticsPage({ code: 0, data: {} }, 'videos')).toBeNull();
    expect(parseAnalyticsPage({ code: 0, data: { videos: 'não é lista' } }, 'videos')).toBeNull();
    expect(parseAnalyticsPage(null, 'videos')).toBeNull();
  });

  it('resposta vazia (sucesso sem dados) tem items=[] e observedFields=[] — nunca lança', () => {
    const page = parseAnalyticsPage({ code: 0, data: { videos: [], total_count: 0, next_page_token: '', latest_available_date: '2026-09-10' } }, 'videos');
    expect(page).toEqual({ items: [], observedFields: [], totalCount: 0, nextPageToken: null, latestAvailableDate: '2026-09-10' });
  });
});

describe('toVideoSummary — creator só existe na 202605, nunca inventado na 202509', () => {
  it('202509: sem campo creator na resposta real -> creator null, mesmo pedindo a versão certa', () => {
    const page = parseAnalyticsPage(REAL_VIDEO_202509, 'videos')!;
    const summary = toVideoSummary(page.items[0], '202509');
    expect(summary.version).toBe('202509');
    expect(summary.creator).toBeNull();
    expect(summary.clickThroughRate).toBe('12.5%');
    expect(summary.gmv).toEqual({ amount: '246.80', currency: 'USD' });
  });

  it('202605: creator vem preenchido com os 4 campos documentados', () => {
    const page = parseAnalyticsPage(REAL_VIDEO_202605, 'videos')!;
    const summary = toVideoSummary(page.items[0], '202605');
    expect(summary.version).toBe('202605');
    expect(summary.creator).toEqual({
      openId: 'uACafQAAAABmUU2qon4R0vUYvUVS3QC6CICP2m5A2-wd77j8R9G0yg',
      userName: 'creator_shop_01',
      nickName: 'abc_bec',
      authorType: 'OFFICIAL',
    });
    expect(summary.clickThroughRate).toBe('0.0528'); // formato decimal, diferente do "12.5%" da 202509 — nunca reformatado/unificado
  });

  it('mesmo se o item de uma resposta 202509 tivesse um campo "creator" por engano, só é lido quando version=202605 (nunca por acaso)', () => {
    const itemWithStrayCreator = { ...REAL_VIDEO_202509.data.videos[0], creator: { open_id: 'x', user_name: 'y', nick_name: 'z', author_type: 'OFFICIAL' } };
    const summary = toVideoSummary(itemWithStrayCreator, '202509');
    expect(summary.creator).toBeNull();
  });
});

describe('toProductSummary — 202509 (overall_performance) vs 202605 (total_performance + canais) nunca misturados', () => {
  it('202509: só overallPerformance, sem totalPerformance nem canais', () => {
    const page = parseAnalyticsPage(REAL_PRODUCT_202509, 'products')!;
    const summary = toProductSummary(page.items[0], '202509');
    expect(summary.version).toBe('202509');
    if (summary.version === '202509') {
      expect(summary.overallPerformance).toEqual({ gmv: { amount: '395.03', currency: 'GBP' }, orders: 12, itemsSold: 12 });
    }
    expect('totalPerformance' in summary).toBe(false);
  });

  it('202605: totalPerformance com o funil, e channelsWithData lista os 7 blocos de canal presentes', () => {
    const page = parseAnalyticsPage(REAL_PRODUCT_202605, 'products')!;
    const summary = toProductSummary(page.items[0], '202605');
    expect(summary.version).toBe('202605');
    if (summary.version === '202605') {
      expect(summary.totalPerformance).toMatchObject({
        gmv: { amount: '395.03', currency: 'GBP' },
        orders: 12,
        skuOrders: 12,
        itemsSold: 12,
        productImpressions: 5420,
        ctr: '0.0808',
      });
      expect(summary.channelsWithData).toEqual([
        'seller_live_performance',
        'seller_video_performance',
        'seller_product_card_performance',
        'affiliate_total_performance',
        'affiliate_live_performance',
        'affiliate_video_performance',
        'shop_tab_performance',
      ]);
    }
  });

  it('id normalizado pra string nas duas versões (documentado como string em ambas)', () => {
    expect(toProductSummary(parseAnalyticsPage(REAL_PRODUCT_202509, 'products')!.items[0], '202509').id).toBe('1732333333333333629');
    expect(toProductSummary(parseAnalyticsPage(REAL_PRODUCT_202605, 'products')!.items[0], '202605').id).toBe('1732333333333333629');
  });

  it('produto 202605 sem nenhum bloco de canal presente -> channelsWithData vazio (nunca inventa canal)', () => {
    const summary = toProductSummary({ id: '1', total_performance: { gmv: { amount: '1', currency: 'USD' } } }, '202605');
    if (summary.version === '202605') expect(summary.channelsWithData).toEqual([]);
  });
});

describe('classifyShopAnalyticsError — só os 3 códigos confirmados na doc oficial de common error codes', () => {
  it('105005 = permissão insuficiente', () => {
    const error = new TikTokApiError('Access denied. The app is not authorized...', 403, 105005, 'req1');
    expect(classifyShopAnalyticsError(error)).toMatchObject({ kind: 'insufficient_permission', code: 105005 });
  });

  it('105002 = token expirado', () => {
    const error = new TikTokApiError('Expired credentials. The access_token ... has expired.', 401, 105002, 'req2');
    expect(classifyShopAnalyticsError(error)).toMatchObject({ kind: 'token_expired', code: 105002 });
  });

  it('28001022 = período inválido', () => {
    const error = new TikTokApiError('invalid request params; detail: start time or end time is invalid.', 400, 28001022, 'req3');
    expect(classifyShopAnalyticsError(error)).toMatchObject({ kind: 'invalid_period', code: 28001022 });
  });

  it('qualquer outro código/erro cai em api_error — nunca uma categoria inventada', () => {
    const error = new TikTokApiError('Internal error.', 500, 36009003, 'req4');
    expect(classifyShopAnalyticsError(error)).toMatchObject({ kind: 'api_error', code: 36009003 });
    expect(classifyShopAnalyticsError(new Error('rede caiu'))).toMatchObject({ kind: 'api_error' });
    expect(classifyShopAnalyticsError('nem é Error')).toMatchObject({ kind: 'api_error', message: 'Erro desconhecido.' });
  });
});

describe('isVersionUnavailableError — só os 2 sinais confirmados de versão/rota indisponível', () => {
  it('36009009 (Invalid path) = indisponível', () => {
    expect(isVersionUnavailableError(new TikTokApiError('Invalid path. The specified path does not match any available endpoint.', 404, 36009009, 'r'))).toBe(true);
  });

  it('36009014 ou 36009004 com "Invalid API version" na mensagem = indisponível', () => {
    expect(isVersionUnavailableError(new TikTokApiError('Invalid API version. The version value is invalid or unsupported.', 400, 36009014, 'r'))).toBe(true);
    expect(isVersionUnavailableError(new TikTokApiError('Invalid API version. The version value is invalid or unsupported.', 400, 36009004, 'r'))).toBe(true);
  });

  it('36009004 com OUTRA mensagem (reaproveitado pra vários motivos) NÃO conta como versão indisponível', () => {
    expect(isVersionUnavailableError(new TikTokApiError('Invalid credentials. The access_token header is invalid.', 401, 36009004, 'r'))).toBe(false);
  });

  it('os 3 códigos de negócio (permissão/token/período) nunca contam como versão indisponível', () => {
    expect(isVersionUnavailableError(new TikTokApiError('x', 403, 105005, 'r'))).toBe(false);
    expect(isVersionUnavailableError(new TikTokApiError('x', 401, 105002, 'r'))).toBe(false);
    expect(isVersionUnavailableError(new TikTokApiError('x', 400, 28001022, 'r'))).toBe(false);
    expect(isVersionUnavailableError(new Error('rede caiu'))).toBe(false);
  });
});

function fakePage(items: unknown[], nextPageToken: string | null, totalCount = items.length): AnalyticsPage {
  return { items: items as AnalyticsPage['items'], observedFields: items.length ? Object.keys(items[0] as object) : [], totalCount, nextPageToken, latestAvailableDate: '2026-09-10' };
}

describe('collectPaginated', () => {
  it('segue next_page_token entre páginas e para quando ele deixa de vir', async () => {
    const pages = [fakePage([{ id: '1' }, { id: '2' }], 'tok2'), fakePage([{ id: '3' }], null)];
    let calls = 0;
    const result = await collectPaginated(
      async (pageToken) => {
        calls++;
        if (calls === 1) expect(pageToken).toBeUndefined();
        if (calls === 2) expect(pageToken).toBe('tok2');
        return pages[calls - 1];
      },
      (item: Record<string, unknown>) => item.id,
    );
    expect(result.items).toEqual(['1', '2', '3']);
    expect(result.pagesFetched).toBe(2);
    expect(result.truncatedByPageLimit).toBe(false);
  });

  it('resposta vazia na 1ª página: items=[], 1 página buscada, sem truncamento', async () => {
    const result = await collectPaginated(async () => fakePage([], null, 0), (item: Record<string, unknown>) => item.id);
    expect(result.items).toEqual([]);
    expect(result.pagesFetched).toBe(1);
    expect(result.truncatedByPageLimit).toBe(false);
  });

  it('respeita o limite de segurança de páginas mesmo com mais páginas disponíveis (nunca vira uma varredura completa)', async () => {
    let calls = 0;
    const result = await collectPaginated(
      async () => {
        calls++;
        return fakePage([{ id: String(calls) }], 'sempre-tem-mais'); // nunca fica sem next_page_token
      },
      (item: Record<string, unknown>) => item.id,
    );
    expect(result.pagesFetched).toBe(DIAGNOSTIC_MAX_PAGES);
    expect(result.truncatedByPageLimit).toBe(true);
    expect(result.items).toHaveLength(DIAGNOSTIC_MAX_PAGES);
  });

  it('seedPage: usa a 1ª página já buscada (pelo fallback de versão) sem chamar fetchPage de novo pra ela', async () => {
    const seed = fakePage([{ id: 'seed' }], 'tok2');
    let calls = 0;
    const result = await collectPaginated(
      async (pageToken) => {
        calls++;
        expect(pageToken).toBe('tok2'); // só é chamado pra página 2 em diante
        return fakePage([{ id: '2' }], null);
      },
      (item: Record<string, unknown>) => item.id,
      undefined,
      seed,
    );
    expect(calls).toBe(1); // não rechamou pra pegar a 1ª página
    expect(result.items).toEqual(['seed', '2']);
    expect(result.pagesFetched).toBe(2);
  });
});

describe('defaultAnalyticsWindow', () => {
  it('nunca inclui hoje nem uma data futura, e a janela tem o tamanho pedido', () => {
    const now = new Date('2026-09-14T12:00:00Z');
    const w = defaultAnalyticsWindow(now, 'America/Sao_Paulo', { lagDays: 2, spanDays: 7 });
    expect(w.endDateLt < '2026-09-14').toBe(true); // sempre antes de "hoje"
    expect(w.startDateGe < w.endDateLt).toBe(true);
    const spanMs = new Date(`${w.endDateLt}T00:00:00Z`).getTime() - new Date(`${w.startDateGe}T00:00:00Z`).getTime();
    expect(spanMs / 86_400_000).toBe(7);
  });
});
