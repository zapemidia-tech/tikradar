import { getTikTokCreatorConfig } from '@/lib/tiktok/creator-config';
import { TikTokCreatorClient } from '@/lib/tiktok/creator-client';
import { refreshCreatorToken } from '@/lib/tiktok/creator-auth';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import type { TikTokConnection } from '@/lib/tiktok/types';

export type AffiliateCreatorClientResult =
  | { status: 'ready'; client: TikTokCreatorClient; openId: string; grantedScopes: string[]; tokenRefreshed: boolean }
  | { status: 'not_connected' }
  | { status: 'expired' };

/** Renova quando faltam menos de 5 min — evita usar um token que vence no meio das chamadas. */
export const CREATOR_TOKEN_REFRESH_MARGIN_SECONDS = 300;
const CREATOR_USER_TYPE = 1; // mesmo valor exigido no callback: 1 = criador, 0 = vendedor.

/** Dependências injetáveis só para teste; em produção usa as reais. */
export interface AffiliateCreatorClientDeps {
  store?: {
    latest(userId: string, purpose: 'affiliate_creator'): Promise<TikTokConnection | null>;
    save: SupabaseTikTokTokenStore['save'];
  };
  refresh?: typeof refreshCreatorToken;
  nowMs?: () => number;
}

/**
 * Cliente de criador afiliado vinculado EXCLUSIVAMENTE à conexão
 * `affiliate_creator` do usuário — nunca lê `own_shop` nem
 * `bestsellers_sync`, nunca usa shop_cipher/token/app key/app secret do
 * seller. Sem uma conexão `affiliate_creator` real e válida, não há
 * cliente, ponto — quem chama decide o que mostrar ('not_connected' vs
 * 'expired').
 *
 * Refresh: se o access token já venceu (ou vence em menos de
 * CREATOR_TOKEN_REFRESH_MARGIN_SECONDS) e o refresh token ainda vale, troca
 * pelo par novo com as credenciais do app de CRIADOR (refreshCreatorToken,
 * nunca o refresh do seller) e salva na MESMA conexão `affiliate_creator`
 * do usuário. Só aceita a resposta se for do mesmo criador (mesmo open_id,
 * user_type 1) — nunca grava a identidade de outra conta. Se o refresh
 * falhar: com o token antigo ainda válido, segue com ele; já vencido,
 * devolve 'expired' (pede reconexão, como antes).
 */
export async function createAffiliateCreatorClient(
  env: NodeJS.ProcessEnv = process.env,
  userId: string,
  deps: AffiliateCreatorClientDeps = {},
): Promise<AffiliateCreatorClientResult> {
  // Sem usuário não há conexão — e `latest(undefined)` buscaria entre TODOS os usuários.
  if (!userId) return { status: 'not_connected' };

  const store = deps.store ?? new SupabaseTikTokTokenStore(env);
  const nowSeconds = (deps.nowMs?.() ?? Date.now()) / 1000;
  const connection = await store.latest(userId, 'affiliate_creator');
  if (!connection) return { status: 'not_connected' };

  const config = getTikTokCreatorConfig(env);
  const accessStillValid = connection.accessTokenExpiresAt > nowSeconds;
  const nearExpiry = connection.accessTokenExpiresAt - nowSeconds <= CREATOR_TOKEN_REFRESH_MARGIN_SECONDS;

  const ready = (accessToken: string, grantedScopes: string[], tokenRefreshed: boolean): AffiliateCreatorClientResult => ({
    status: 'ready',
    client: new TikTokCreatorClient(config, accessToken),
    openId: connection.openId,
    grantedScopes,
    tokenRefreshed,
  });

  if (!nearExpiry) return ready(connection.accessToken, connection.grantedScopes, false);

  const fallback = () => (accessStillValid ? ready(connection.accessToken, connection.grantedScopes, false) : ({ status: 'expired' } as const));
  if (!connection.refreshToken || connection.refreshTokenExpiresAt <= nowSeconds) return fallback();

  let renewed;
  try {
    renewed = await (deps.refresh ?? refreshCreatorToken)(config, connection.refreshToken);
  } catch {
    return fallback();
  }
  if (renewed.openId !== connection.openId || renewed.userType !== CREATOR_USER_TYPE) return fallback();

  // A resposta de refresh pode omitir granted_scopes — nesse caso mantém os já concedidos.
  const grantedScopes = renewed.grantedScopes.length > 0 ? renewed.grantedScopes : connection.grantedScopes;
  try {
    await store.save(
      { ...renewed, grantedScopes, sellerName: connection.sellerName, sellerBaseRegion: connection.sellerBaseRegion },
      userId,
      'affiliate_creator',
    );
  } catch {
    // Token novo já emitido: usa nesta requisição mesmo sem conseguir salvar (a próxima tenta de novo).
  }
  return ready(renewed.accessToken, grantedScopes, true);
}

// Reexportado só pra deixar claro, no ponto de uso, que o refresh de
// criador existe e é uma função separada do refresh de seller
// (refreshSellerToken, lib/tiktok/auth.ts) — nunca a mesma chamada.
export { refreshCreatorToken };
