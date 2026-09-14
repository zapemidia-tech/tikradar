import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import { createOwnShopClient } from '@/services/tiktok/create-own-shop-client';

// Fake mínimo do client Supabase — mesma disciplina dos outros testes de
// tiktok_connections: só simula a forma do PostgREST, nunca toca rede.
function fakeSupabase(rows: Record<string, unknown>[]) {
  function from() {
    const filters: [string, unknown][] = [];
    const api = {
      select: () => api,
      eq(k: string, v: unknown) {
        filters.push([k, v]);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle() {
        const matched = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
    };
    return api;
  }
  return { from };
}

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

// createOwnShopClient() instancia SupabaseTikTokTokenStore por conta própria
// (não é injetável por fora) — a única forma de controlar o que ele lê,
// sem mockar rede de verdade, é trocar temporariamente o método privado
// `client()` no PROTOTYPE (afeta qualquer instância criada enquanto o teste
// roda) e restaurar depois. `env` ainda é passado normalmente por
// createOwnShopClient, então TIKTOK_TOKEN_ENCRYPTION_KEY continua vindo daí.
let originalClientMethod: unknown;
beforeEach(() => {
  originalClientMethod = (SupabaseTikTokTokenStore.prototype as unknown as { client: unknown }).client;
});
afterEach(() => {
  (SupabaseTikTokTokenStore.prototype as unknown as { client: unknown }).client = originalClientMethod;
});

function patchSupabaseRows(rows: Record<string, unknown>[]) {
  const fake = fakeSupabase(rows);
  (SupabaseTikTokTokenStore.prototype as unknown as { client: () => unknown }).client = () => fake;
}

function baseEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'dummy',
    TIKTOK_TOKEN_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    TIKTOK_SHOP_APP_KEY: 'app-key',
    TIKTOK_SHOP_APP_SECRET: 'app-secret',
  };
}

async function encryptedCiphertext(plain: string): Promise<string> {
  // mesmo esquema (AES-256-GCM) de lib/tiktok/token-store.ts — reimplementado
  // aqui só pra montar a fixture (não importa o módulo privado de criptografia).
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', Buffer.from(TEST_ENCRYPTION_KEY, 'base64'), { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const joined = new Uint8Array(iv.length + cipher.byteLength);
  joined.set(iv);
  joined.set(new Uint8Array(cipher), iv.length);
  return Buffer.from(joined).toString('base64');
}

async function connectionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    platform_user_id: 'user-1',
    open_id: 'open-id-1',
    seller_name: 'Loja',
    seller_base_region: 'BR',
    shop_cipher: 'shop-cipher-xyz',
    access_token_ciphertext: await encryptedCiphertext('access-token-secreto'),
    refresh_token_ciphertext: await encryptedCiphertext('refresh-token-secreto'),
    access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    granted_scopes: ['data.shop_analytics.public.read'],
    updated_at: new Date().toISOString(),
    connection_purpose: 'own_shop',
    ...overrides,
  };
}

describe('createOwnShopClient — nunca lê a conexão bestsellers_sync', () => {
  it('not_connected: só existe a conexão bestsellers_sync do usuário — nunca usada como se fosse own_shop', async () => {
    patchSupabaseRows([await connectionRow({ connection_purpose: 'bestsellers_sync', seller_name: 'Loja do Bestsellers' })]);
    const result = await createOwnShopClient(baseEnv(), 'user-1');
    expect(result.status).toBe('not_connected');
  });

  it('ready: usa a linha own_shop, mesmo com uma bestsellers_sync também presente para o mesmo usuário', async () => {
    patchSupabaseRows([await connectionRow({ connection_purpose: 'bestsellers_sync', seller_name: 'Loja do Bestsellers' }), await connectionRow({ connection_purpose: 'own_shop', seller_name: 'Minha Loja' })]);
    const result = await createOwnShopClient(baseEnv(), 'user-1');
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.sellerName).toBe('Minha Loja');
  });

  it('expired: token own_shop vencido — não constrói client, nunca chama a API com token velho', async () => {
    patchSupabaseRows([await connectionRow({ access_token_expires_at: new Date(Date.now() - 1000).toISOString() })]);
    const result = await createOwnShopClient(baseEnv(), 'user-1');
    expect(result.status).toBe('expired');
  });

  it('not_connected: nenhuma linha para este usuário', async () => {
    patchSupabaseRows([await connectionRow({ platform_user_id: 'outro-usuario' })]);
    const result = await createOwnShopClient(baseEnv(), 'user-1');
    expect(result.status).toBe('not_connected');
  });
});
