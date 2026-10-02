import { describe, it, expect } from 'vitest';
import { AFFILIATE_CREATOR_SCOPES, grantedAffiliateCreatorScopes, hasAllAffiliateCreatorScopes, parseConnectionPurpose, resolveAffiliateCreatorState } from '@/lib/tiktok/connection-purpose';

describe('ConnectionPurpose — 3 propósitos distintos, nunca confundidos', () => {
  it('parseConnectionPurpose nunca resolve para affiliate_creator, mesmo se pedido na URL (rota seller compartilhada nunca aceita esse propósito)', () => {
    expect(parseConnectionPurpose('affiliate_creator')).toBe('bestsellers_sync'); // cai no padrão seguro, nunca no valor pedido
  });

  it('parseConnectionPurpose continua resolvendo own_shop/bestsellers_sync normalmente (comportamento seller inalterado)', () => {
    expect(parseConnectionPurpose('own_shop')).toBe('own_shop');
    expect(parseConnectionPurpose('bestsellers_sync')).toBe('bestsellers_sync');
    expect(parseConnectionPurpose(undefined)).toBe('bestsellers_sync');
    expect(parseConnectionPurpose(null)).toBe('bestsellers_sync');
  });
});

describe('grantedAffiliateCreatorScopes / hasAllAffiliateCreatorScopes', () => {
  it('os 3 scopes esperados são exatamente os confirmados na doc oficial', () => {
    expect(AFFILIATE_CREATOR_SCOPES).toEqual(['creator.affiliate.info', 'creator.showcase.read', 'creator.affiliate_collaboration.read']);
  });

  it('nenhum scope concedido -> todos false, hasAll=false', () => {
    const granted = grantedAffiliateCreatorScopes(null);
    expect(Object.values(granted).every((v) => v === false)).toBe(true);
    expect(hasAllAffiliateCreatorScopes(null)).toBe(false);
  });

  it('autorização PARCIAL (só 2 dos 3) -> hasAll=false, mas marca individualmente quais vieram', () => {
    const granted = grantedAffiliateCreatorScopes(['creator.affiliate.info', 'creator.showcase.read']);
    expect(granted['creator.affiliate.info']).toBe(true);
    expect(granted['creator.showcase.read']).toBe(true);
    expect(granted['creator.affiliate_collaboration.read']).toBe(false);
    expect(hasAllAffiliateCreatorScopes(['creator.affiliate.info', 'creator.showcase.read'])).toBe(false);
  });

  it('os 3 concedidos -> hasAll=true', () => {
    expect(hasAllAffiliateCreatorScopes([...AFFILIATE_CREATOR_SCOPES])).toBe(true);
  });

  it('scopes extras não-relacionados não afetam o resultado', () => {
    expect(hasAllAffiliateCreatorScopes([...AFFILIATE_CREATOR_SCOPES, 'creator.video.write', 'algum.outro.scope'])).toBe(true);
  });
});

describe('resolveAffiliateCreatorState', () => {
  const now = new Date('2026-09-30T12:00:00Z');

  it('sem linha / sem access_token_expires_at -> not_connected', () => {
    expect(resolveAffiliateCreatorState(null, now)).toBe('not_connected');
    expect(resolveAffiliateCreatorState({ open_id: 'x', access_token_expires_at: null, granted_scopes: [...AFFILIATE_CREATOR_SCOPES] }, now)).toBe('not_connected');
  });

  it('token vencido -> expired, mesmo com os 3 scopes concedidos', () => {
    const row = { open_id: 'x', access_token_expires_at: '2026-09-30T11:00:00Z', granted_scopes: [...AFFILIATE_CREATOR_SCOPES] };
    expect(resolveAffiliateCreatorState(row, now)).toBe('expired');
  });

  it('token válido mas faltando scope -> permission_pending', () => {
    const row = { open_id: 'x', access_token_expires_at: '2026-10-01T00:00:00Z', granted_scopes: ['creator.affiliate.info'] };
    expect(resolveAffiliateCreatorState(row, now)).toBe('permission_pending');
  });

  it('token válido e os 3 scopes concedidos -> ready', () => {
    const row = { open_id: 'x', access_token_expires_at: '2026-10-01T00:00:00Z', granted_scopes: [...AFFILIATE_CREATOR_SCOPES] };
    expect(resolveAffiliateCreatorState(row, now)).toBe('ready');
  });
});
