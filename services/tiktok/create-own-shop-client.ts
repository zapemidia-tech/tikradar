import { getTikTokConfig } from '@/lib/tiktok/config';
import { TikTokShopClient } from '@/lib/tiktok/client';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';

export type OwnShopClientResult =
  | { status: 'ready'; client: TikTokShopClient; sellerName?: string; sellerBaseRegion?: string }
  | { status: 'not_connected' }
  | { status: 'expired' };

/**
 * Cliente TikTok Shop vinculado EXCLUSIVAMENTE à conexão `own_shop` do
 * usuário — nunca lê nem cai de volta na conexão `bestsellers_sync` (ver
 * lib/tiktok/connection-purpose.ts) e nunca usa um `shop_cipher`/access
 * token estático de variável de ambiente: sem uma conexão `own_shop` real e
 * válida, não há cliente, ponto — quem chama decide o que mostrar
 * ('not_connected' vs 'expired').
 */
export async function createOwnShopClient(env: NodeJS.ProcessEnv = process.env, userId: string): Promise<OwnShopClientResult> {
  const connection = await new SupabaseTikTokTokenStore(env).latest(userId, 'own_shop');
  if (!connection || !connection.shopCipher) return { status: 'not_connected' };
  if (connection.accessTokenExpiresAt * 1000 <= Date.now()) return { status: 'expired' };

  const base = getTikTokConfig(env);
  const client = new TikTokShopClient({
    ...base,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    shopCipher: connection.shopCipher,
  });
  return { status: 'ready', client, sellerName: connection.sellerName, sellerBaseRegion: connection.sellerBaseRegion };
}
