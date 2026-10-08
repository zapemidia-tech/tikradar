import { describe, it, expect } from 'vitest';
import { affiliateCreatorReturnPath } from '@/lib/tiktok/creator-oauth-messages';

// Para onde o callback OAuth de criador devolve o usuário: a tela de
// integrações é só de admin — um usuário comum que voltasse para lá não
// veria o resultado da conexão.
describe('affiliateCreatorReturnPath', () => {
  it('admin volta para a tela de integrações (comportamento anterior preservado)', () => {
    expect(affiliateCreatorReturnPath('admin', { connected: true })).toBe('/admin/integrations/tiktok?purpose=affiliate_creator&connected=1');
    expect(affiliateCreatorReturnPath('admin', { error: 'state_invalid' })).toBe('/admin/integrations/tiktok?purpose=affiliate_creator&error=state_invalid');
  });

  it('usuário comum volta para "Minha conta de afiliado", nunca para /admin', () => {
    expect(affiliateCreatorReturnPath('user', { connected: true })).toBe('/minha-conta-afiliado?connected=1');
    expect(affiliateCreatorReturnPath('user', { error: 'cancelled' })).toBe('/minha-conta-afiliado?error=cancelled');
    expect(affiliateCreatorReturnPath('user', { error: 'not_creator' }).startsWith('/admin')).toBe(false);
  });

  it('papel nulo/desconhecido nunca vai para /admin', () => {
    expect(affiliateCreatorReturnPath(null, { connected: true })).toBe('/minha-conta-afiliado?connected=1');
    expect(affiliateCreatorReturnPath(undefined, { error: 'save_failed' })).toBe('/minha-conta-afiliado?error=save_failed');
  });
});
