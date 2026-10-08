import { describe, it, expect, vi } from 'vitest';
import { createAffiliateCreatorClient, CREATOR_TOKEN_REFRESH_MARGIN_SECONDS } from '@/services/tiktok/create-affiliate-creator-client';
import type { TikTokConnection } from '@/lib/tiktok/types';
import type { TikTokCreatorTokens } from '@/lib/tiktok/creator-auth';

// Refresh automático do token de CRIADOR: renova perto do vencimento, só
// aceita a resposta do mesmo criador, preserva nome/região/scopes e nunca
// consulta a conexão sem um usuário definido.

const NOW = 1_800_000_000; // segundos
const ENV = { TIKTOK_CREATOR_APP_KEY: 'creator-key', TIKTOK_CREATOR_APP_SECRET: 'creator-secret' } as unknown as NodeJS.ProcessEnv;

function conexao(over: Partial<TikTokConnection> = {}): TikTokConnection {
  return {
    accessToken: 'access-antigo',
    accessTokenExpiresAt: NOW + 3600,
    refreshToken: 'refresh-antigo',
    refreshTokenExpiresAt: NOW + 30 * 86400,
    openId: 'open-1',
    sellerName: 'criador_x',
    sellerBaseRegion: 'BR',
    userType: 0,
    grantedScopes: ['creator.affiliate.info', 'creator.showcase.read', 'creator.affiliate_collaboration.read'],
    updatedAt: '2026-10-01T00:00:00Z',
    ...over,
  };
}

function tokensNovos(over: Partial<TikTokCreatorTokens> = {}): TikTokCreatorTokens {
  return {
    accessToken: 'access-novo',
    accessTokenExpiresAt: NOW + 7 * 86400,
    refreshToken: 'refresh-novo',
    refreshTokenExpiresAt: NOW + 60 * 86400,
    openId: 'open-1',
    userType: 1,
    grantedScopes: [],
    ...over,
  };
}

function montar(conn: TikTokConnection | null, refresh?: () => Promise<TikTokCreatorTokens>) {
  const store = { latest: vi.fn(async () => conn), save: vi.fn(async () => {}) };
  const refreshFn = vi.fn(refresh ?? (async () => tokensNovos()));
  const deps = { store, refresh: refreshFn, nowMs: () => NOW * 1000 };
  return { store, refreshFn, deps };
}

describe('createAffiliateCreatorClient — refresh do token de criador', () => {
  it('sem usuário: não consulta nada e devolve not_connected', async () => {
    const { store, deps } = montar(conexao());
    expect(await createAffiliateCreatorClient(ENV, '', deps)).toEqual({ status: 'not_connected' });
    expect(store.latest).not.toHaveBeenCalled();
  });

  it('sem conexão affiliate_creator: not_connected (lê sempre com o propósito explícito)', async () => {
    const { store, deps } = montar(null);
    expect(await createAffiliateCreatorClient(ENV, 'u1', deps)).toEqual({ status: 'not_connected' });
    expect(store.latest).toHaveBeenCalledWith('u1', 'affiliate_creator');
  });

  it('token longe do vencimento: usa o atual, sem refresh', async () => {
    const { refreshFn, store, deps } = montar(conexao());
    const r = await createAffiliateCreatorClient(ENV, 'u1', deps);
    expect(r).toMatchObject({ status: 'ready', openId: 'open-1', tokenRefreshed: false });
    expect(refreshFn).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('token vencido com refresh válido: renova, salva na mesma conexão e preserva nome/região/scopes', async () => {
    const conn = conexao({ accessTokenExpiresAt: NOW - 10 });
    const { refreshFn, store, deps } = montar(conn);
    const r = await createAffiliateCreatorClient(ENV, 'u1', deps);
    expect(r).toMatchObject({ status: 'ready', tokenRefreshed: true, grantedScopes: conn.grantedScopes });
    expect(refreshFn).toHaveBeenCalledWith(expect.objectContaining({ appKey: 'creator-key' }), 'refresh-antigo');
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-novo', refreshToken: 'refresh-novo', sellerName: 'criador_x', sellerBaseRegion: 'BR', grantedScopes: conn.grantedScopes }),
      'u1',
      'affiliate_creator',
    );
  });

  it('dentro da margem de vencimento: renova antes de vencer', async () => {
    const { refreshFn, deps } = montar(conexao({ accessTokenExpiresAt: NOW + CREATOR_TOKEN_REFRESH_MARGIN_SECONDS - 1 }));
    expect(await createAffiliateCreatorClient(ENV, 'u1', deps)).toMatchObject({ status: 'ready', tokenRefreshed: true });
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it('refresh devolve scopes: usa os novos', async () => {
    const { store, deps } = montar(conexao({ accessTokenExpiresAt: NOW - 10 }), async () => tokensNovos({ grantedScopes: ['creator.affiliate.info'] }));
    const r = await createAffiliateCreatorClient(ENV, 'u1', deps);
    expect(r).toMatchObject({ grantedScopes: ['creator.affiliate.info'] });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ grantedScopes: ['creator.affiliate.info'] }), 'u1', 'affiliate_creator');
  });

  it('token vencido e refresh token vencido: expired, sem chamar a TikTok', async () => {
    const { refreshFn, deps } = montar(conexao({ accessTokenExpiresAt: NOW - 10, refreshTokenExpiresAt: NOW - 1 }));
    expect(await createAffiliateCreatorClient(ENV, 'u1', deps)).toEqual({ status: 'expired' });
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it('token vencido e refresh falha: expired, nada salvo', async () => {
    const { store, deps } = montar(conexao({ accessTokenExpiresAt: NOW - 10 }), async () => {
      throw new Error('TikTok recusou');
    });
    expect(await createAffiliateCreatorClient(ENV, 'u1', deps)).toEqual({ status: 'expired' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('perto do vencimento e refresh falha: segue com o token atual (ainda válido)', async () => {
    const { store, deps } = montar(conexao({ accessTokenExpiresAt: NOW + 60 }), async () => {
      throw new Error('rede');
    });
    expect(await createAffiliateCreatorClient(ENV, 'u1', deps)).toMatchObject({ status: 'ready', tokenRefreshed: false });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('refresh de OUTRA conta (open_id diferente): nunca salva, trata como falha', async () => {
    const { store, deps } = montar(conexao({ accessTokenExpiresAt: NOW - 10 }), async () => tokensNovos({ openId: 'open-OUTRO' }));
    expect(await createAffiliateCreatorClient(ENV, 'u1', deps)).toEqual({ status: 'expired' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('refresh devolve token de VENDEDOR (user_type 0): nunca salva, trata como falha', async () => {
    const { store, deps } = montar(conexao({ accessTokenExpiresAt: NOW - 10 }), async () => tokensNovos({ userType: 0 }));
    expect(await createAffiliateCreatorClient(ENV, 'u1', deps)).toEqual({ status: 'expired' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('refresh ok mas falha ao salvar: usa o token novo nesta requisição', async () => {
    const conn = conexao({ accessTokenExpiresAt: NOW - 10 });
    const { store, deps } = montar(conn);
    store.save.mockRejectedValueOnce(new Error('supabase fora'));
    expect(await createAffiliateCreatorClient(ENV, 'u1', deps)).toMatchObject({ status: 'ready', tokenRefreshed: true });
  });
});
