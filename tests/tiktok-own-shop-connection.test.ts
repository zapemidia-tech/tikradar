import { describe, it, expect } from 'vitest';
import { parseConnectionPurpose, hasShopAnalyticsScope, resolveOwnShopState, resolveConfirmedShop, SHOP_ANALYTICS_SCOPE } from '@/lib/tiktok/connection-purpose';
import { createOAuthState, isOAuthStateExpired, diagnoseCallback } from '@/lib/tiktok/oauth-state';
import { ownShopOAuthErrorMessage, OWN_SHOP_OAUTH_ERROR_MESSAGES } from '@/lib/tiktok/oauth-messages';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import type { TikTokOAuthTokens } from '@/lib/tiktok/types';

describe('parseConnectionPurpose', () => {
  it('só aceita "own_shop" explicitamente; qualquer outra coisa cai em bestsellers_sync', () => {
    expect(parseConnectionPurpose('own_shop')).toBe('own_shop');
    expect(parseConnectionPurpose('bestsellers_sync')).toBe('bestsellers_sync');
    expect(parseConnectionPurpose(undefined)).toBe('bestsellers_sync');
    expect(parseConnectionPurpose(null)).toBe('bestsellers_sync');
    expect(parseConnectionPurpose('bogus')).toBe('bestsellers_sync');
    expect(parseConnectionPurpose(['own_shop', 'bestsellers_sync'])).toBe('own_shop');
  });
});

describe('hasShopAnalyticsScope', () => {
  it('true só quando o escopo exato está no array', () => {
    expect(hasShopAnalyticsScope([SHOP_ANALYTICS_SCOPE])).toBe(true);
    expect(hasShopAnalyticsScope(['seller.authorization.info', 'data.bestselling.public.read'])).toBe(false);
    expect(hasShopAnalyticsScope([])).toBe(false);
    expect(hasShopAnalyticsScope(null)).toBe(false);
    expect(hasShopAnalyticsScope(undefined)).toBe(false);
  });
});

describe('resolveOwnShopState — nunca "pronta" sem confirmação real', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it('not_connected: sem linha, ou linha sem shop_cipher', () => {
    expect(resolveOwnShopState(null)).toBe('not_connected');
    expect(resolveOwnShopState({ shop_cipher: null, access_token_expires_at: future, granted_scopes: [SHOP_ANALYTICS_SCOPE] })).toBe('not_connected');
  });

  it('expired: token vencido — nunca confia no granted_scopes gravado sem reconectar', () => {
    expect(resolveOwnShopState({ shop_cipher: 'abc', access_token_expires_at: past, granted_scopes: [SHOP_ANALYTICS_SCOPE] })).toBe('expired');
  });

  it('permission_pending: token válido, mas sem o escopo de análise — não é "pronta"', () => {
    expect(resolveOwnShopState({ shop_cipher: 'abc', access_token_expires_at: future, granted_scopes: ['seller.authorization.info'] })).toBe('permission_pending');
  });

  it('ready: token válido E escopo confirmado', () => {
    expect(resolveOwnShopState({ shop_cipher: 'abc', access_token_expires_at: future, granted_scopes: [SHOP_ANALYTICS_SCOPE] })).toBe('ready');
  });
});

describe('resolveConfirmedShop — "Minha loja" nunca herda o shop_cipher estático de outra loja', () => {
  it('usa a loja confirmada ao vivo quando a API responde, em qualquer propósito', () => {
    const live = { cipher: 'live-cipher', name: 'Loja Real', region: 'BR' };
    expect(resolveConfirmedShop({ purpose: 'own_shop', liveShop: live, staticShopCipher: 'static-cipher' })).toEqual(live);
    expect(resolveConfirmedShop({ purpose: 'bestsellers_sync', liveShop: live, staticShopCipher: 'static-cipher' })).toEqual(live);
  });

  it('bestsellers_sync pode cair no shop_cipher estático quando a confirmação ao vivo falha (comportamento preexistente preservado)', () => {
    const result = resolveConfirmedShop({ purpose: 'bestsellers_sync', liveShop: null, staticShopCipher: 'static-cipher', staticFallbackName: 'Sandbox' });
    expect(result).toEqual({ cipher: 'static-cipher', name: 'Sandbox', region: undefined });
  });

  it('own_shop NUNCA cai no shop_cipher estático — mesmo que ele exista configurado, retorna null (loja não confirmada)', () => {
    const result = resolveConfirmedShop({ purpose: 'own_shop', liveShop: null, staticShopCipher: 'static-cipher-da-loja-do-bestsellers' });
    expect(result).toBeNull();
  });

  it('sem confirmação ao vivo e sem estático: null nos dois propósitos (nunca uma loja inventada)', () => {
    expect(resolveConfirmedShop({ purpose: 'bestsellers_sync', liveShop: null })).toBeNull();
    expect(resolveConfirmedShop({ purpose: 'own_shop', liveShop: null })).toBeNull();
  });
});

describe('oauth-state — expiração explícita do state', () => {
  it('createOAuthState gera "<hex>.<epoch>"', () => {
    const state = createOAuthState(new Date('2026-09-13T12:00:00Z'));
    expect(state).toMatch(/^[0-9a-f]{32}\.\d+$/);
  });

  it('isOAuthStateExpired: false dentro da janela, true depois de 600s', () => {
    const issued = new Date('2026-09-13T12:00:00Z');
    const state = createOAuthState(issued);
    expect(isOAuthStateExpired(state, new Date(issued.getTime() + 599_000))).toBe(false);
    expect(isOAuthStateExpired(state, new Date(issued.getTime() + 601_000))).toBe(true);
  });

  it('formato irreconhecível é tratado como expirado (nunca aceito por engano)', () => {
    expect(isOAuthStateExpired('nao-tem-timestamp')).toBe(true);
    expect(isOAuthStateExpired('')).toBe(true);
  });
});

describe('diagnoseCallback — 4 motivos distintos de falha, nunca um genérico só', () => {
  const now = new Date('2026-09-13T12:00:00Z');
  const freshState = createOAuthState(now);

  it('state_missing: sem cookie', () => {
    expect(diagnoseCallback({ code: 'abc', state: freshState, expectedFromCookie: null, now })).toBe('state_missing');
  });

  it('state_invalid: state da URL não bate com o cookie', () => {
    expect(diagnoseCallback({ code: 'abc', state: 'outro', expectedFromCookie: freshState, now })).toBe('state_invalid');
  });

  it('state_expired: bate, mas passou da janela', () => {
    const old = new Date(now.getTime() - 601_000);
    const state = createOAuthState(old);
    expect(diagnoseCallback({ code: 'abc', state, expectedFromCookie: state, now })).toBe('state_expired');
  });

  it('no_code: state válido, mas sem "code" (cancelamento/fluxo incompleto)', () => {
    expect(diagnoseCallback({ code: null, state: freshState, expectedFromCookie: freshState, now })).toBe('no_code');
  });

  it('null quando tudo confere', () => {
    expect(diagnoseCallback({ code: 'abc', state: freshState, expectedFromCookie: freshState, now })).toBeNull();
  });
});

describe('ownShopOAuthErrorMessage', () => {
  it('cobre todos os códigos com mensagens distintas entre si', () => {
    const messages = Object.values(OWN_SHOP_OAUTH_ERROR_MESSAGES);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('código desconhecido cai numa mensagem genérica, nunca undefined', () => {
    expect(ownShopOAuthErrorMessage('algo-inexistente')).toBeTruthy();
    expect(ownShopOAuthErrorMessage(null)).toBeTruthy();
  });
});

// --- SupabaseTikTokTokenStore: separação real entre os dois propósitos ----
// Fake mínimo do client Supabase (mesma disciplina de tests/creators.test.ts:
// simula só a forma do PostgREST, nunca toca rede de verdade).
function fakeSupabase() {
  let rows: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];
  function from(table: string) {
    if (table === 'security_audit_events') {
      return { insert: async (row: Record<string, unknown>) => { audit.push(row); return { error: null }; } };
    }
    const filters: [string, unknown][] = [];
    let deleteMode = false;
    const api = {
      select: () => api,
      eq(k: string, v: unknown) { filters.push([k, v]); return api; },
      order: () => api,
      limit: () => api,
      delete: () => { deleteMode = true; return api; },
      upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
        const cols = opts.onConflict.split(',');
        const idx = rows.findIndex((r) => cols.every((c) => r[c] === row[c]));
        if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
        else rows.push({ ...row });
        return Promise.resolve({ error: null });
      },
      maybeSingle() {
        const matched = rows
          .filter((r) => filters.every(([k, v]) => r[k] === v))
          .sort((a, b) => new Date(b.updated_at as string).getTime() - new Date(a.updated_at as string).getTime());
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
      then(resolve: (v: { data?: unknown[]; error: null; count?: number }) => void) {
        if (deleteMode) {
          const before = rows.length;
          rows = rows.filter((r) => !filters.every(([k, v]) => r[k] === v));
          return Promise.resolve({ error: null, count: before - rows.length }).then(resolve);
        }
        return Promise.resolve({ data: rows.filter((r) => filters.every(([k, v]) => r[k] === v)), error: null }).then(resolve);
      },
    };
    return api;
  }
  return { from };
}

// AES-256-GCM exige exatamente 32 bytes — conteúdo arbitrário, só para o
// round-trip encrypt/decrypt funcionar de forma determinística no teste.
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

function makeStore(client: ReturnType<typeof fakeSupabase>) {
  const store = new SupabaseTikTokTokenStore({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'dummy',
    TIKTOK_TOKEN_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  });
  (store as unknown as { client: () => unknown }).client = () => client;
  return store;
}

function tokens(overrides: Partial<TikTokOAuthTokens> = {}): TikTokOAuthTokens {
  return {
    accessToken: 'access-xyz',
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    refreshToken: 'refresh-xyz',
    refreshTokenExpiresAt: Math.floor(Date.now() / 1000) + 7 * 86400,
    openId: 'open-id-1',
    sellerName: 'Loja Teste',
    sellerBaseRegion: 'BR',
    userType: 0,
    grantedScopes: [SHOP_ANALYTICS_SCOPE],
    ...overrides,
  };
}

describe('SupabaseTikTokTokenStore — separação entre bestsellers_sync e own_shop', () => {
  it('salvar as duas conexões do mesmo usuário (mesmo open_id) não colide, e cada uma só aparece no propósito certo', async () => {
    const client = fakeSupabase();
    const store = makeStore(client);

    await store.save(tokens({ sellerName: 'Loja do Bestsellers', grantedScopes: ['data.bestselling.public.read'] }), 'user-1', 'bestsellers_sync');
    await store.save(tokens({ sellerName: 'Minha Loja', grantedScopes: [SHOP_ANALYTICS_SCOPE] }), 'user-1', 'own_shop');

    const bestsellers = await store.latest('user-1', 'bestsellers_sync');
    const ownShop = await store.latest('user-1', 'own_shop');

    expect(bestsellers?.sellerName).toBe('Loja do Bestsellers');
    expect(ownShop?.sellerName).toBe('Minha Loja');
  });

  it('reconectar "Minha loja" depois do Bestsellers não faz a sincronização Bestsellers "ver" a conexão nova (o bug que esta migration corrige)', async () => {
    const client = fakeSupabase();
    const store = makeStore(client);

    await store.save(tokens({ sellerName: 'Loja do Bestsellers' }), 'user-1', 'bestsellers_sync');
    // "own_shop" é salva DEPOIS (updated_at mais recente) — antes da coluna de
    // propósito, `.latest(userId)` sem filtro pegaria esta por ser a mais nova.
    await new Promise((r) => setTimeout(r, 5));
    await store.save(tokens({ sellerName: 'Minha Loja Nova' }), 'user-1', 'own_shop');

    const bestsellers = await store.latest('user-1', 'bestsellers_sync');
    expect(bestsellers?.sellerName).toBe('Loja do Bestsellers'); // continua a mesma, nunca vira "Minha Loja Nova"
  });

  it('desconectar "Minha loja" nunca apaga a conexão do Bestsellers', async () => {
    const client = fakeSupabase();
    const store = makeStore(client);
    await store.save(tokens(), 'user-1', 'bestsellers_sync');
    await store.save(tokens({ openId: 'open-id-2' }), 'user-1', 'own_shop');

    const deleted = await store.deleteForUser('user-1', 'own_shop');
    expect(deleted).toBe(1);
    expect(await store.latest('user-1', 'own_shop')).toBeNull();
    expect(await store.latest('user-1', 'bestsellers_sync')).not.toBeNull(); // intocada
  });

  it('status() também respeita o propósito', async () => {
    const client = fakeSupabase();
    const store = makeStore(client);
    await store.save(tokens({ grantedScopes: ['data.bestselling.public.read'] }), 'user-1', 'bestsellers_sync');
    await store.save(tokens({ openId: 'open-id-2', grantedScopes: [SHOP_ANALYTICS_SCOPE] }), 'user-1', 'own_shop');

    const ownStatus = await store.status('user-1', 'own_shop');
    expect(ownStatus?.granted_scopes).toEqual([SHOP_ANALYTICS_SCOPE]);
  });
});
