import { describe, it, expect } from 'vitest';
import { TikTokApiError } from '@/lib/tiktok/errors';
import {
  AFFILIATE_CREATOR_MAX_PAGES,
  AFFILIATE_ORDERS_MAX_PAGE_SIZE,
  SHOWCASE_PRODUCTS_MAX_PAGE_SIZE,
  collectAffiliateCreatorPages,
  getCreatorProfile,
  getShowcaseProductsPage,
  searchAffiliateOrdersPage,
  searchTargetCollaborationsPage,
} from '@/services/tiktok/affiliate-creator-service';
import { TikTokCreatorClient } from '@/lib/tiktok/creator-client';
import type { TikTokCreatorConfig } from '@/lib/tiktok/creator-config';

function fakeClient(behavior: (path: string, query: Record<string, unknown>, body: unknown) => unknown) {
  const config: TikTokCreatorConfig = {
    apiBaseUrl: 'https://example.com',
    authBaseUrl: 'https://example.com',
    creatorAuthorizeUrl: 'https://example.com/auth',
    appKey: 'creator-key',
    appSecret: 'creator-secret',
    isProduction: false,
  };
  const client = new TikTokCreatorClient(config, 'creator-access-token');
  (client as unknown as { request: (path: string, query: Record<string, unknown>, init?: { body?: unknown }) => Promise<unknown> }).request = async (path, query, init) =>
    behavior(path, query ?? {}, init?.body);
  return client;
}

describe('getCreatorProfile', () => {
  it('sucesso: retorna o perfil normalizado', async () => {
    const client = fakeClient(() => ({ code: 0, data: { username: 'loja01', selection_region: 'BR' } }));
    const profile = await getCreatorProfile(client);
    expect(profile).toMatchObject({ username: 'loja01', selectionRegion: 'BR' });
  });

  it('erro de negócio nunca vira perfil vazio — propaga classificado', async () => {
    const client = fakeClient(() => {
      throw new TikTokApiError('Access denied.', 403, 105005, 'r1');
    });
    await expect(getCreatorProfile(client)).rejects.toMatchObject({ code: 105005 });
  });
});

describe('getShowcaseProductsPage', () => {
  it('usa page_size máximo documentado (20) por padrão e origin=SHOWCASE', async () => {
    let seenQuery: Record<string, unknown> = {};
    const client = fakeClient((_path, query) => {
      seenQuery = query;
      return { code: 0, data: { products: [], total_count: 0 } };
    });
    await getShowcaseProductsPage(client, { origin: 'SHOWCASE' });
    expect(seenQuery.page_size).toBe(SHOWCASE_PRODUCTS_MAX_PAGE_SIZE);
    expect(seenQuery.origin).toBe('SHOWCASE');
  });

  it('sucesso vazio (sem produtos na vitrine) -> items=[], nunca erro', async () => {
    const client = fakeClient(() => ({ code: 0, data: { products: [], total_count: 0 } }));
    const page = await getShowcaseProductsPage(client, { origin: 'SHOWCASE' });
    expect(page.items).toEqual([]);
  });

  it('formato inesperado (data.products ausente) continua erro — nunca lista vazia disfarçada', async () => {
    const client = fakeClient(() => ({ code: 0, data: {} }));
    await expect(getShowcaseProductsPage(client, { origin: 'SHOWCASE' })).rejects.toThrow(/formato inesperado/);
  });
});

describe('searchAffiliateOrdersPage', () => {
  it('envia create_time_ge/create_time_lt no CORPO (POST), não na query — conforme documentado', async () => {
    let seenBody: unknown;
    const client = fakeClient((_path, _query, body) => {
      seenBody = body;
      return { code: 0, data: { orders: [], total_count: 0 } };
    });
    await searchAffiliateOrdersPage(client, { createTimeGe: 100, createTimeLt: 200 });
    expect(seenBody).toEqual({ create_time_ge: 100, create_time_lt: 200 });
  });

  it('page_size máximo documentado é 100', async () => {
    let seenQuery: Record<string, unknown> = {};
    const client = fakeClient((_path, query) => {
      seenQuery = query;
      return { code: 0, data: { orders: [], total_count: 0 } };
    });
    await searchAffiliateOrdersPage(client, {});
    expect(seenQuery.page_size).toBe(AFFILIATE_ORDERS_MAX_PAGE_SIZE);
  });

  it('erro de permissão nunca vira pedidos vazios', async () => {
    const client = fakeClient(() => {
      throw new TikTokApiError('x', 403, 105005, 'r');
    });
    await expect(searchAffiliateOrdersPage(client, {})).rejects.toMatchObject({ code: 105005 });
  });
});

describe('searchTargetCollaborationsPage', () => {
  it('shop_id é obrigatório no corpo — enviado como veio, nunca inventado', async () => {
    let seenBody: unknown;
    const client = fakeClient((_path, _query, body) => {
      seenBody = body;
      return { code: 0, data: { target_collaborations: [], total_count: 0 } };
    });
    await searchTargetCollaborationsPage(client, { shopId: '789078671231' });
    expect(seenBody).toMatchObject({ shop_id: '789078671231' });
  });
});

describe('collectAffiliateCreatorPages — nunca vira uma varredura completa do histórico', () => {
  it('respeita AFFILIATE_CREATOR_MAX_PAGES mesmo com mais páginas disponíveis', async () => {
    let calls = 0;
    const fetchPage = async () => {
      calls++;
      return { items: [calls], observedFields: [], totalCount: 9999, nextPageToken: 'sempre-tem-mais' };
    };
    const result = await collectAffiliateCreatorPages(fetchPage);
    expect(calls).toBe(AFFILIATE_CREATOR_MAX_PAGES);
    expect(result.pagesFetched).toBe(AFFILIATE_CREATOR_MAX_PAGES);
    expect(result.truncatedByPageLimit).toBe(true);
    expect(result.items).toHaveLength(AFFILIATE_CREATOR_MAX_PAGES);
  });

  it('para quando next_page_token deixa de vir, mesmo antes do limite', async () => {
    const pages = [
      { items: [1], observedFields: [], totalCount: 2, nextPageToken: 'tok2' },
      { items: [2], observedFields: [], totalCount: 2, nextPageToken: null },
    ];
    let i = 0;
    const result = await collectAffiliateCreatorPages(async () => pages[i++]);
    expect(result.pagesFetched).toBe(2);
    expect(result.truncatedByPageLimit).toBe(false);
    expect(result.items).toEqual([1, 2]);
  });
});
