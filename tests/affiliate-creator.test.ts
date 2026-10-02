import { describe, it, expect } from 'vitest';
import {
  aggregateVideoSales,
  classifyAffiliateCreatorError,
  parseAffiliateCreatorPage,
  toAffiliateOrder,
  toCreatorProfile,
  toShowcaseProduct,
  toTargetCollaboration,
} from '@/lib/tiktok/affiliate-creator';
import { TikTokApiError, TikTokSchemaError } from '@/lib/tiktok/errors';

// Exemplos REAIS de resposta, baixados via API do Partner Center
// (document/detail, workspace_id=3) em 2026-09-30 — nunca inventados.

const REAL_PROFILE_RESPONSE = {
  code: 0,
  data: {
    avatar: { width: 100, height: 100, url: 'https://p16-sign.tiktokcdn-us.com/avatar.webp' },
    username: 'abc123',
    selection_region: 'US',
    register_region: 'US',
    seller_type: 'LOCAL',
    permissions: ['LIVE_STREAM_PERMISSION', 'SELF_SALE_PERMISSION', 'ADD_AFFILIATE_PERMISSION'],
    user_type: 'TIKTOK_SHOP_OFFICIAL_ACCOUNT',
    creator_user_open_id: 'uACafQAAAABmUU2qon4R0vUYvUVS3QC6CICP2m5A2-wd77j8R9G0yg',
  },
  message: 'Success',
  request_id: 'req1',
};

const REAL_SHOWCASE_ITEM = {
  id: '53219092314',
  shop: { name: 'Gift store' },
  title: 'Chirstmas Gift',
  main_images: [{ width: 100, heigth: 100, url: 'https://p16-sign.tiktokcdn-us.com/img.webp' }],
  status: { inventory_status: 'IN_STOCK', review_status: 'APPROVED', is_hidden: false, added_status: 'ADDED' },
  source: 'AFFILIATE',
  detail_link: 'https://shop.tiktok.com/view/product/248901892031?region=US&local=en',
  commission: { rate: 3000, reward_rate: 500 },
};

const REAL_ORDER_ITEM = {
  id: '789078671231123124',
  create_time: 1685548800,
  status: 'SETTLED',
  skus: [
    {
      id: '1729793769377925388',
      product_id: '1729793769377859852',
      product_name: 'black_suit',
      content_type: 'LIVE',
      content_id: '7493990579714164574',
      quantity: 2,
      commission_rate: 1000,
      estimated_commission: { amount: '1.980', currency: 'IDR' },
      actual_commission: { amount: '1.900', currency: 'IDR' },
      returned_quantity: 1,
      refunded_quantity: 0,
    },
  ],
};

const REAL_COLLABORATION_ITEM = {
  id: '789078671231123124',
  name: 'target_collaboration',
  status: 'LIVE',
  products: [
    {
      id: '1729432087292775344',
      title: 'Blue t-shirt',
      main_image_url: 'https://p16-oec-va.ibyteimg.com/img.webp',
      commission: { rate: 1000, amount: '121.23', currency: 'USD' },
    },
  ],
};

describe('toCreatorProfile', () => {
  it('extrai os campos documentados da resposta real', () => {
    const profile = toCreatorProfile(REAL_PROFILE_RESPONSE);
    expect(profile).toEqual({
      username: 'abc123',
      avatarUrl: 'https://p16-sign.tiktokcdn-us.com/avatar.webp',
      selectionRegion: 'US',
      registerRegion: 'US',
      sellerType: 'LOCAL',
      userType: 'TIKTOK_SHOP_OFFICIAL_ACCOUNT',
      permissions: ['LIVE_STREAM_PERMISSION', 'SELF_SALE_PERMISSION', 'ADD_AFFILIATE_PERMISSION'],
      creatorUserOpenId: 'uACafQAAAABmUU2qon4R0vUYvUVS3QC6CICP2m5A2-wd77j8R9G0yg',
    });
  });

  it('data ausente/do tipo errado -> null, nunca finge sucesso', () => {
    expect(toCreatorProfile({ code: 0 })).toBeNull();
    expect(toCreatorProfile(null)).toBeNull();
    expect(toCreatorProfile('string qualquer')).toBeNull();
  });

  it('campos opcionais ausentes viram null, nunca inventados', () => {
    const profile = toCreatorProfile({ code: 0, data: { username: 'só_isso' } });
    expect(profile).toEqual({
      username: 'só_isso',
      avatarUrl: null,
      selectionRegion: null,
      registerRegion: null,
      sellerType: null,
      userType: null,
      permissions: null,
      creatorUserOpenId: null,
    });
  });
});

describe('toShowcaseProduct', () => {
  it('extrai os campos documentados do item real', () => {
    const p = toShowcaseProduct(REAL_SHOWCASE_ITEM);
    expect(p).toMatchObject({
      id: '53219092314',
      title: 'Chirstmas Gift',
      shopName: 'Gift store',
      mainImageUrl: 'https://p16-sign.tiktokcdn-us.com/img.webp',
      inventoryStatus: 'IN_STOCK',
      reviewStatus: 'APPROVED',
      isHidden: false,
      source: 'AFFILIATE',
      commissionRate: 3000,
      commissionRewardRate: 500,
    });
  });

  it('nunca inventa preço/comissão/URL quando ausentes', () => {
    const p = toShowcaseProduct({ id: '1' });
    expect(p.commissionRate).toBeNull();
    expect(p.detailLink).toBeNull();
    expect(p.mainImageUrl).toBeNull();
  });
});

describe('toAffiliateOrder — status de comissão nunca "promovido" sem confirmação', () => {
  it('extrai pedido e SKUs reais, incluindo content_type/content_id', () => {
    const order = toAffiliateOrder(REAL_ORDER_ITEM);
    expect(order.id).toBe('789078671231123124');
    expect(order.status).toBe('SETTLED');
    expect(order.skus).toHaveLength(1);
    expect(order.skus[0]).toMatchObject({ contentType: 'LIVE', contentId: '7493990579714164574', quantity: 2 });
    expect(order.skus[0].estimatedCommission).toEqual({ amount: '1.980', currency: 'IDR' });
    expect(order.skus[0].actualCommission).toEqual({ amount: '1.900', currency: 'IDR' });
  });

  it('status pendente (AWAITING_PAYMENT/TO_SETTLE) é guardado como veio — nunca normalizado pra SETTLED', () => {
    expect(toAffiliateOrder({ id: '1', status: 'AWAITING_PAYMENT', skus: [] }).status).toBe('AWAITING_PAYMENT');
    expect(toAffiliateOrder({ id: '1', status: 'TO_SETTLE', skus: [] }).status).toBe('TO_SETTLE');
  });

  it('skus ausente/não-lista -> [], nunca lança', () => {
    expect(toAffiliateOrder({ id: '1' }).skus).toEqual([]);
    expect(toAffiliateOrder({ id: '1', skus: 'não é lista' }).skus).toEqual([]);
  });
});

describe('toTargetCollaboration', () => {
  it('extrai colaboração e produtos reais', () => {
    const c = toTargetCollaboration(REAL_COLLABORATION_ITEM);
    expect(c).toMatchObject({ id: '789078671231123124', name: 'target_collaboration', status: 'LIVE' });
    expect(c.products).toHaveLength(1);
    expect(c.products[0]).toMatchObject({ id: '1729432087292775344', title: 'Blue t-shirt', commissionRate: 1000 });
  });
});

describe('aggregateVideoSales — atribuição por vídeo SÓ quando content_type===VIDEO e content_id presente', () => {
  it('agrega corretamente vendas de 2 pedidos pro MESMO content_id, somando por moeda', () => {
    const orders = [
      toAffiliateOrder({
        id: 'o1',
        skus: [{ content_type: 'VIDEO', content_id: 'v1', quantity: 2, estimated_commission: { amount: '10.00', currency: 'USD' }, actual_commission: { amount: '9.00', currency: 'USD' } }],
      }),
      toAffiliateOrder({
        id: 'o2',
        skus: [{ content_type: 'VIDEO', content_id: 'v1', quantity: 3, estimated_commission: { amount: '15.00', currency: 'USD' }, actual_commission: { amount: '14.00', currency: 'USD' } }],
      }),
    ];
    const result = aggregateVideoSales(orders);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ contentId: 'v1', orderCount: 2, unitsSold: 5 });
    expect(result[0].estimatedCommission).toEqual([{ currency: 'USD', amount: 25 }]);
    expect(result[0].actualCommission).toEqual([{ currency: 'USD', amount: 23 }]);
  });

  it('NUNCA inclui vendas de content_type diferente de VIDEO (SHOP/LIVE/PRE_LIVE/PROMOTION_PAGE/LINKSHARE)', () => {
    const orders = ['SHOP', 'LIVE', 'PRE_LIVE', 'PROMOTION_PAGE', 'LINKSHARE'].map((t, i) =>
      toAffiliateOrder({ id: `o${i}`, skus: [{ content_type: t, content_id: `c${i}`, quantity: 1 }] }),
    );
    expect(aggregateVideoSales(orders)).toEqual([]);
  });

  it('VIDEO sem content_id (ausente/inválido) nunca entra na agregação — nunca inventa um ID', () => {
    const orders = [toAffiliateOrder({ id: 'o1', skus: [{ content_type: 'VIDEO', quantity: 1 }] })];
    expect(aggregateVideoSales(orders)).toEqual([]);
  });

  it('múltiplas moedas no mesmo vídeo nunca são somadas juntas — uma entrada por moeda', () => {
    const orders = [
      toAffiliateOrder({ id: 'o1', skus: [{ content_type: 'VIDEO', content_id: 'v1', quantity: 1, actual_commission: { amount: '10.00', currency: 'USD' } }] }),
      toAffiliateOrder({ id: 'o2', skus: [{ content_type: 'VIDEO', content_id: 'v1', quantity: 1, actual_commission: { amount: '50.00', currency: 'BRL' } }] }),
    ];
    const result = aggregateVideoSales(orders);
    expect(result[0].actualCommission).toEqual(expect.arrayContaining([{ currency: 'USD', amount: 10 }, { currency: 'BRL', amount: 50 }]));
    expect(result[0].actualCommission).toHaveLength(2);
  });

  it('pedido sem nenhum SKU de vídeo real (fixture completa da doc oficial, content_type=LIVE) não aparece no ranking', () => {
    expect(aggregateVideoSales([toAffiliateOrder(REAL_ORDER_ITEM)])).toEqual([]);
  });
});

describe('parseAffiliateCreatorPage', () => {
  it('extrai items/observedFields/totalCount/nextPageToken de uma resposta real de showcase', () => {
    const raw = { code: 0, data: { products: [REAL_SHOWCASE_ITEM], next_page_token: 'tok', total_count: 15 } };
    const page = parseAffiliateCreatorPage(raw, 'products', toShowcaseProduct);
    expect(page).not.toBeNull();
    expect(page!.items).toHaveLength(1);
    expect(page!.totalCount).toBe(15);
    expect(page!.nextPageToken).toBe('tok');
    expect(page!.observedFields).toContain('title');
  });

  it('formato inesperado (chave ausente ou tipo errado) -> null, nunca finge sucesso', () => {
    expect(parseAffiliateCreatorPage({ code: 0, data: {} }, 'products', toShowcaseProduct)).toBeNull();
    expect(parseAffiliateCreatorPage({ code: 0, data: { products: 'não é lista' } }, 'products', toShowcaseProduct)).toBeNull();
    expect(parseAffiliateCreatorPage(null, 'products', toShowcaseProduct)).toBeNull();
  });

  it('sucesso vazio (lista real vazia) -> items=[], nunca lança', () => {
    const page = parseAffiliateCreatorPage({ code: 0, data: { products: [], total_count: 0 } }, 'products', toShowcaseProduct);
    expect(page).toEqual({ items: [], observedFields: [], totalCount: 0, nextPageToken: null });
  });
});

describe('classifyAffiliateCreatorError — só os 4 códigos oficiais confirmados no guia de autorização de criador', () => {
  it('105005 = permissão insuficiente', () => {
    expect(classifyAffiliateCreatorError(new TikTokApiError('x', 403, 105005, 'r'))).toMatchObject({ kind: 'insufficient_permission', code: 105005 });
  });
  it('105002 = token expirado', () => {
    expect(classifyAffiliateCreatorError(new TikTokApiError('x', 401, 105002, 'r'))).toMatchObject({ kind: 'token_expired', code: 105002 });
  });
  it('105001 = token inválido/revogado', () => {
    expect(classifyAffiliateCreatorError(new TikTokApiError('x', 401, 105001, 'r'))).toMatchObject({ kind: 'token_invalid', code: 105001 });
  });
  it('101000 = identidade de token errada (ex.: token de seller usado numa API de criador)', () => {
    expect(classifyAffiliateCreatorError(new TikTokApiError('x', 403, 101000, 'r'))).toMatchObject({ kind: 'wrong_token_identity', code: 101000 });
  });
  it('TikTokSchemaError (formato inesperado) nunca é confundido com erro de negócio', () => {
    const error = new TikTokSchemaError('formato inesperado', { shape: { arrayKey: 'products' } });
    expect(classifyAffiliateCreatorError(error)).toMatchObject({ kind: 'unexpected_format' });
  });
  it('qualquer outro código/erro cai em api_error — nunca uma categoria inventada', () => {
    expect(classifyAffiliateCreatorError(new TikTokApiError('x', 500, 36009002, 'r'))).toMatchObject({ kind: 'api_error', code: 36009002 });
    expect(classifyAffiliateCreatorError(new Error('rede caiu'))).toMatchObject({ kind: 'api_error' });
  });
});
