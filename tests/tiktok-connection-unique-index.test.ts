import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import type { TikTokOAuthTokens } from '@/lib/tiktok/types';

// Regressão de DOIS incidentes reais em 2026-09-13, na mesma tabela:
//
// 1) A migration 009 rodou só até o `drop index` — o `create unique index`
//    seguinte nunca chegou a existir. Sem NENHUM índice único cobrindo as
//    colunas do `onConflict`, todo upsert falhava com 42P10. Corrigido
//    (aparentemente) pela migration 010, que recria o índice...
// 2) ...só que 010 recriou o índice como PARCIAL (`WHERE platform_user_id
//    IS NOT NULL`, copiado sem pensar da 009) — e um índice único PARCIAL
//    nunca serve de "arbiter" para um `ON CONFLICT (colunas)` sem predicado
//    (é assim que o Postgres funciona: para usar um índice parcial como
//    arbiter, o próprio ON CONFLICT precisaria repetir o WHERE, e o
//    PostgREST/supabase-js não tem como fazer isso pela opção `onConflict`,
//    que só aceita uma lista de colunas). Confirmado com upsert real contra
//    produção: mesmo com o índice parcial existindo, 42P10 continuava.
//    Corrigido de verdade pela migration 011, que troca por um índice único
//    NÃO parcial nas mesmas 3 colunas.
//
// Este arquivo simula os dois cenários (índice ausente e índice parcial) e
// confirma que só um índice único COMUM resolve.

interface FakeUniqueIndex {
  columns: string[];
  /** true = índice parcial (tem WHERE) — nunca serve de arbiter pro onConflict do PostgREST, não importa o predicado. */
  partial?: boolean;
}

/** Fake do client Supabase que, diferente do fake mais simples usado em
 * tests/tiktok-own-shop-connection.test.ts, MODELA a semântica real do
 * ON CONFLICT do Postgres: um upsert só funciona se `onConflict` casar
 * exatamente com as colunas de um índice único NÃO parcial — um índice
 * parcial nunca é escolhido como arbiter por um `onConflict` só de colunas,
 * mesmo que as colunas batam. */
function fakeSupabaseWithIndexes(uniqueIndexes: FakeUniqueIndex[]) {
  const rows: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];

  function findArbiterIndex(onConflict: string) {
    const cols = onConflict.split(',');
    return uniqueIndexes.find((idx) => !idx.partial && idx.columns.length === cols.length && idx.columns.every((c) => cols.includes(c)));
  }

  function from(table: string) {
    if (table === 'security_audit_events') {
      return { insert: async (row: Record<string, unknown>) => { audit.push(row); return { error: null }; } };
    }
    return {
      upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
        if (!findArbiterIndex(opts.onConflict)) {
          return Promise.resolve({
            error: { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' },
          });
        }
        const cols = opts.onConflict.split(',');
        const idx = rows.findIndex((r) => cols.every((c) => r[c] === row[c]));
        if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
        else rows.push({ ...row });
        return Promise.resolve({ error: null });
      },
    };
  }
  return { from, __rows: rows, __audit: audit };
}

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

function makeStore(client: ReturnType<typeof fakeSupabaseWithIndexes>) {
  const store = new SupabaseTikTokTokenStore({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'dummy',
    TIKTOK_TOKEN_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  });
  (store as unknown as { client: () => unknown }).client = () => client;
  return store;
}

function tokens(): TikTokOAuthTokens {
  return {
    accessToken: 'access-xyz',
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    refreshToken: 'refresh-xyz',
    refreshTokenExpiresAt: Math.floor(Date.now() / 1000) + 7 * 86400,
    openId: 'open-id-1',
    sellerName: 'Loja Teste',
    sellerBaseRegion: 'BR',
    userType: 0,
    grantedScopes: ['data.shop_analytics.public.read'],
  };
}

describe('SupabaseTikTokTokenStore.save — índice único ausente ou parcial', () => {
  it('incidente 1: nenhum índice único cobre as 3 colunas — save() falha, exatamente o que virava error=save_failed', async () => {
    const client = fakeSupabaseWithIndexes([]);
    const store = makeStore(client);
    await expect(store.save(tokens(), 'user-1', 'own_shop')).rejects.toThrow(/Falha ao salvar conexão/);
    await expect(store.save(tokens(), 'user-1', 'own_shop')).rejects.toThrow(/42P10|ON CONFLICT/);
  });

  it('índice antigo de 2 colunas (platform_user_id, open_id) não serve pro onConflict atual de 3 colunas', async () => {
    const client = fakeSupabaseWithIndexes([{ columns: ['platform_user_id', 'open_id'] }]);
    const store = makeStore(client);
    await expect(store.save(tokens(), 'user-1', 'own_shop')).rejects.toThrow(/Falha ao salvar conexão/);
  });

  it('incidente 2: índice de 3 colunas existe, mas é PARCIAL (WHERE platform_user_id IS NOT NULL) — ainda falha com 42P10, mesmo as colunas batendo certinho', async () => {
    const client = fakeSupabaseWithIndexes([{ columns: ['platform_user_id', 'open_id', 'connection_purpose'], partial: true }]);
    const store = makeStore(client);
    await expect(store.save(tokens(), 'user-1', 'own_shop')).rejects.toThrow(/Falha ao salvar conexão/);
    await expect(store.save(tokens(), 'user-1', 'own_shop')).rejects.toThrow(/ON CONFLICT/);
  });

  it('correção real (migration 011): índice de 3 colunas NÃO parcial — save() funciona, inclusive na 2ª chamada (caminho de UPDATE do upsert)', async () => {
    const client = fakeSupabaseWithIndexes([{ columns: ['platform_user_id', 'open_id', 'connection_purpose'] }]);
    const store = makeStore(client);
    await expect(store.save(tokens(), 'user-1', 'own_shop')).resolves.toBeUndefined();
    await expect(store.save(tokens(), 'user-1', 'own_shop')).resolves.toBeUndefined(); // reconectar não quebra
  });
});

// --- Contrato migration ↔ código ------------------------------------------
// A causa raiz nunca foi só "a coluna existe" nem só "as colunas do índice
// batem" — precisa ser um índice único que bata nas colunas E não seja
// parcial. Este teste lê o SQL das migrations (a definição EFETIVA — a
// última que mexe no índice, já que 010 criou um parcial e 011 o substitui)
// e o onConflict usado no código, garantindo que os dois nunca voltem a
// divergir silenciosamente nem regridam pra uma versão parcial.
describe('contrato: onConflict do token-store bate com o índice único (não parcial) definido nas migrations', () => {
  it('a última definição de índice único para tiktok_connections nas migrations bate com o onConflict do código e não é parcial', () => {
    const tokenStoreSrc = readFileSync(join(process.cwd(), 'lib/tiktok/token-store.ts'), 'utf8');
    const onConflictMatches = [...tokenStoreSrc.matchAll(/onConflict:'([^']+)'/g)].map((m) => m[1]);
    expect(onConflictMatches.length).toBeGreaterThan(0);

    // Migrations em ordem numérica: cada CREATE UNIQUE INDEX encontrado é
    // candidato; o último da lista é o que vale de verdade (o que as
    // migrations seguintes não tenham derrubado depois).
    const migrationsDir = join(process.cwd(), 'supabase/migrations');
    const migrationFiles = ['009_connection_purpose.sql', '010_fix_connection_purpose_unique_index.sql', '011_connection_purpose_unique_index_not_partial.sql'];

    type Candidate = { columns: string[]; partial: boolean };
    const candidates: Candidate[] = [];
    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      for (const m of sql.matchAll(/create unique index[^;]*?on\s+public\.tiktok_connections\s*\(([^)]+)\)([^;]*);/gi)) {
        const columns = m[1].split(',').map((c) => c.trim());
        const partial = /\bwhere\b/i.test(m[2]);
        candidates.push({ columns, partial });
      }
    }
    expect(candidates.length, 'nenhum CREATE UNIQUE INDEX para tiktok_connections encontrado nas migrations 009-011').toBeGreaterThan(0);

    const effective = candidates[candidates.length - 1];
    expect(effective.partial, 'a definição efetiva do índice não pode ser parcial — PostgREST não consegue usá-la como arbiter do onConflict').toBe(false);

    for (const onConflict of onConflictMatches) {
      const cols = onConflict.split(',');
      expect(cols.sort()).toEqual([...effective.columns].sort());
    }
  });
});
