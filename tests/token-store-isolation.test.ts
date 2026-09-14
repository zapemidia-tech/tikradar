import { describe, it, expect, vi } from 'vitest';

// Confirma o isolamento entre usuários/lojas que "Minha loja" (app/minha-loja,
// app/api/tiktok/own-shop/dashboard) depende inteiramente de
// SupabaseTikTokTokenStore filtrar por `platform_user_id` — nunca "a conexão
// mais recente de qualquer usuário" (era exatamente esse bug que
// lib/tiktok/connection-purpose.ts documenta ter existido antes). `.status()`
// e `.latest()` usam o MESMO padrão de filtro (`.eq('platform_user_id', userId)`
// + `.eq('connection_purpose', purpose)`) — testado aqui via `.status()`, que
// não decripta nada (evita duplicar a configuração de criptografia só pra
// este teste de isolamento).

interface FakeRow {
  platform_user_id: string;
  connection_purpose: string;
  seller_name: string;
  updated_at: string;
  [key: string]: unknown;
}

function fakeSupabaseClient(rows: FakeRow[]) {
  return {
    from: () => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const matches = rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
          matches.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
          return { data: matches[0] ?? null, error: null };
        },
      };
      return chain;
    },
  };
}

const ROWS: FakeRow[] = [
  { platform_user_id: 'user-A', connection_purpose: 'own_shop', seller_name: 'Loja da Usuária A', updated_at: '2026-09-10T00:00:00Z' },
  { platform_user_id: 'user-B', connection_purpose: 'own_shop', seller_name: 'Loja do Usuário B', updated_at: '2026-09-12T00:00:00Z' }, // mais recente — provaria o bug antigo se o filtro por userId não existisse
  { platform_user_id: 'user-A', connection_purpose: 'bestsellers_sync', seller_name: 'Conexão Bestsellers de A (nunca deveria vir em own_shop)', updated_at: '2026-09-13T00:00:00Z' },
];

describe('SupabaseTikTokTokenStore.status — isolamento entre usuários e entre purposes', () => {
  it('userId A só vê a própria conexão own_shop — nunca a de B, mesmo sendo mais recente', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabaseClient(ROWS) }));
    const { SupabaseTikTokTokenStore } = await import('@/lib/tiktok/token-store');
    const store = new SupabaseTikTokTokenStore({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'k', TIKTOK_TOKEN_ENCRYPTION_KEY: 'a'.repeat(44) } as unknown as NodeJS.ProcessEnv);

    const result = await store.status('user-A', 'own_shop');
    expect(result?.seller_name).toBe('Loja da Usuária A');
  });

  it('userId B só vê a própria conexão own_shop — nunca a de A', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabaseClient(ROWS) }));
    const { SupabaseTikTokTokenStore } = await import('@/lib/tiktok/token-store');
    const store = new SupabaseTikTokTokenStore({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'k', TIKTOK_TOKEN_ENCRYPTION_KEY: 'a'.repeat(44) } as unknown as NodeJS.ProcessEnv);

    const result = await store.status('user-B', 'own_shop');
    expect(result?.seller_name).toBe('Loja do Usuário B');
  });

  it('own_shop nunca retorna a conexão bestsellers_sync do MESMO usuário, mesmo sendo a mais recente de todas', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabaseClient(ROWS) }));
    const { SupabaseTikTokTokenStore } = await import('@/lib/tiktok/token-store');
    const store = new SupabaseTikTokTokenStore({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'k', TIKTOK_TOKEN_ENCRYPTION_KEY: 'a'.repeat(44) } as unknown as NodeJS.ProcessEnv);

    const result = await store.status('user-A', 'own_shop');
    expect(result?.seller_name).toBe('Loja da Usuária A');
    expect(result?.seller_name).not.toContain('Bestsellers');
  });

  it('usuário sem nenhuma conexão own_shop recebe null — nunca a conexão de outro usuário como fallback', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabaseClient(ROWS) }));
    const { SupabaseTikTokTokenStore } = await import('@/lib/tiktok/token-store');
    const store = new SupabaseTikTokTokenStore({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'k', TIKTOK_TOKEN_ENCRYPTION_KEY: 'a'.repeat(44) } as unknown as NodeJS.ProcessEnv);

    const result = await store.status('user-sem-conexao', 'own_shop');
    expect(result).toBeNull();
  });
});
