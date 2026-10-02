import { getTikTokCreatorConfig } from '@/lib/tiktok/creator-config';
import { TikTokCreatorClient } from '@/lib/tiktok/creator-client';
import { refreshCreatorToken } from '@/lib/tiktok/creator-auth';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';

export type AffiliateCreatorClientResult =
  | { status: 'ready'; client: TikTokCreatorClient; openId: string; grantedScopes: string[] }
  | { status: 'not_connected' }
  | { status: 'expired' };

/**
 * Cliente de criador afiliado vinculado EXCLUSIVAMENTE à conexão
 * `affiliate_creator` do usuário — nunca lê `own_shop` nem
 * `bestsellers_sync`, nunca usa shop_cipher/token/app key/app secret do
 * seller. Sem uma conexão `affiliate_creator` real e válida, não há
 * cliente, ponto — quem chama decide o que mostrar ('not_connected' vs
 * 'expired').
 *
 * Diferente de createOwnShopClient: não há refresh automático de token
 * embutido aqui ainda (a API do seller também não tem — este serviço só
 * usa o access token já salvo; se tiver expirado, devolve 'expired' e pede
 * reconexão, igual ao padrão existente). `refreshCreatorToken` é exportado
 * por lib/tiktok/creator-auth.ts pra uso futuro quando houver necessidade
 * real de refresh silencioso — não implementado agora pra não adicionar
 * concorrência/locking sem um caso de uso comprovado (ver seção 11 do
 * pedido: "implemente... se o padrão existente já tiver isso" — não tem).
 */
export async function createAffiliateCreatorClient(env: NodeJS.ProcessEnv = process.env, userId: string): Promise<AffiliateCreatorClientResult> {
  const connection = await new SupabaseTikTokTokenStore(env).latest(userId, 'affiliate_creator');
  if (!connection) return { status: 'not_connected' };
  if (connection.accessTokenExpiresAt * 1000 <= Date.now()) return { status: 'expired' };

  const config = getTikTokCreatorConfig(env);
  const client = new TikTokCreatorClient(config, connection.accessToken);
  return { status: 'ready', client, openId: connection.openId, grantedScopes: connection.grantedScopes };
}

// Reexportado só pra deixar claro, no ponto de uso, que o refresh de
// criador existe e é uma função separada do refresh de seller
// (refreshSellerToken, lib/tiktok/auth.ts) — nunca a mesma chamada.
export { refreshCreatorToken };
