import { z } from 'zod';
import type { TikTokCreatorConfig } from './creator-config';
import { assertTikTokCreatorAppConfigured } from './creator-config';
import { TikTokAuthError } from './errors';

// Troca/refresh de token de CRIADOR — deliberadamente um módulo separado de
// lib/tiktok/auth.ts (seller), mesmo os dois endpoints de token sendo os
// mesmos hosts/paths (auth.tiktok-shops.com/api/v2/token/{get,refresh},
// confirmado no "Creator authorization guide" oficial, 2026-09-30): nunca
// reaproveita `TikTokConfig`/`exchangeAuthorizationCode` do seller, pra
// nunca arriscar um app_key/app_secret do app errado vazar pro outro fluxo
// por um refactor futuro.
//
// Resposta de token de criador NÃO tem seller_name/seller_base_region
// (campos que só existem pra identidade de vendedor) — omitidos aqui de
// propósito, nunca lidos como se existissem.
const creatorTokenResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  request_id: z.string().optional(),
  data: z.object({
    access_token: z.string(),
    access_token_expire_in: z.number(),
    refresh_token: z.string(),
    refresh_token_expire_in: z.number(),
    open_id: z.string(),
    user_type: z.number(),
    granted_scopes: z.array(z.string()).optional(),
  }),
});

export interface TikTokCreatorTokens {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  openId: string;
  /** `1` = criador (confirmado no guia oficial) — `0` é vendedor. Checado pelo chamador logo após a troca; nunca assumido. */
  userType: number;
  grantedScopes: string[];
}

/**
 * `https://shop.tiktok.com/alliance/creator/auth?app_key=...&state=...` —
 * confirmado no "Creator authorization guide" oficial (2026-09-30), que
 * explicitamente diz: "Creator links use the shop.tiktok.com/alliance/
 * creator/auth endpoint with app_key, while Seller links use the
 * services.{region}.tiktokshop.com/open/authorize endpoint with
 * service_id; the two are not interchangeable." `state` é OBRIGATÓRIO (o
 * link básico não inclui — tem que ser concatenado manualmente), diferente
 * do seller (onde é opcional).
 */
export function createCreatorAuthorizationUrl(config: TikTokCreatorConfig, state: string): string {
  assertTikTokCreatorAppConfigured(config);
  const url = new URL(config.creatorAuthorizeUrl);
  url.searchParams.set('app_key', config.appKey);
  url.searchParams.set('state', state);
  return url.toString();
}

async function creatorTokenRequest(config: TikTokCreatorConfig, path: string, params: Record<string, string>): Promise<TikTokCreatorTokens> {
  assertTikTokCreatorAppConfigured(config);
  const url = new URL(path, config.authBaseUrl);
  for (const [k, v] of Object.entries({ app_key: config.appKey, app_secret: config.appSecret, ...params })) url.searchParams.set(k, v);
  const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const parsed = creatorTokenResponseSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success || parsed.data.code !== 0) {
    throw new TikTokAuthError(parsed.success ? `TikTok Creator OAuth: ${parsed.data.message}` : 'Resposta de OAuth de criador inválida.');
  }
  const d = parsed.data.data;
  return {
    accessToken: d.access_token,
    accessTokenExpiresAt: d.access_token_expire_in,
    refreshToken: d.refresh_token,
    refreshTokenExpiresAt: d.refresh_token_expire_in,
    openId: d.open_id,
    userType: d.user_type,
    grantedScopes: d.granted_scopes ?? [],
  };
}

/** `GET https://auth.tiktok-shops.com/api/v2/token/get` — mesmo endpoint do seller, credenciais do app de criador. */
export const exchangeCreatorAuthorizationCode = (config: TikTokCreatorConfig, code: string) =>
  creatorTokenRequest(config, '/api/v2/token/get', { auth_code: code, grant_type: 'authorized_code' });

/** `GET https://auth.tiktok-shops.com/api/v2/token/refresh` — idem. */
export const refreshCreatorToken = (config: TikTokCreatorConfig, refreshToken: string) =>
  creatorTokenRequest(config, '/api/v2/token/refresh', { refresh_token: refreshToken, grant_type: 'refresh_token' });
