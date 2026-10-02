import type { TikTokCreatorConfig } from './creator-config';
import { assertTikTokCreatorAppConfigured } from './creator-config';
import { generateTikTokSignature } from './signature';
import { TikTokApiError, TikTokRateLimitError } from './errors';
import type { TikTokApiEnvelope } from './types';

// Cliente das Affiliate Creator APIs — deliberadamente separado de
// TikTokShopClient (lib/tiktok/client.ts, seller): mesmo algoritmo de
// assinatura e mesmo host (open-api.tiktokglobalshop.com, confirmado no
// path de cada endpoint oficial), mas SEM `shop_cipher` (nenhum endpoint de
// criador documentado usa esse parâmetro — criador não tem loja) e com o
// access token/app key/app secret do app de CRIADOR, nunca do seller.
//
// `accessToken` é SEMPRE passado explicitamente no construtor (nunca lido
// de variável de ambiente) — vem de createAffiliateCreatorClient, que já
// garante que é um token de criador da conexão `affiliate_creator` do
// usuário autenticado, nunca um token de seller.
export class TikTokCreatorClient {
  constructor(
    private readonly config: TikTokCreatorConfig,
    private readonly accessToken: string,
  ) {}

  async request<T = unknown>(
    path: string,
    query: Record<string, string | number | boolean | undefined> = {},
    init: { method?: 'GET' | 'POST'; body?: unknown; maxRetries?: number } = {},
  ): Promise<TikTokApiEnvelope<T>> {
    assertTikTokCreatorAppConfigured(this.config);
    const timestamp = Math.floor(Date.now() / 1000);
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
    const signedQuery = { ...query, app_key: this.config.appKey, timestamp };
    const sign = await generateTikTokSignature({ path, query: signedQuery, appSecret: this.config.appSecret, body, contentType: 'application/json' });
    const url = new URL(path, this.config.apiBaseUrl);
    for (const [k, v] of Object.entries({ ...signedQuery, sign })) if (v !== undefined) url.searchParams.set(k, String(v));

    const retries = init.maxRetries ?? 2;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(url, {
        method: init.method ?? 'GET',
        headers: { 'content-type': 'application/json', 'x-tts-access-token': this.accessToken },
        body,
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const envelope = payload as Partial<TikTokApiEnvelope<T>>;
      if (response.ok && envelope.code === 0) return envelope as TikTokApiEnvelope<T>;
      const retriable = response.status === 429 || response.status >= 500;
      if (retriable && attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
        continue;
      }
      if (response.status === 429) throw new TikTokRateLimitError('Limite de requisições da TikTok Shop (criador) atingido.', response.status, envelope.code, envelope.request_id);
      throw new TikTokApiError(envelope.message || `TikTok Shop (criador) respondeu HTTP ${response.status}.`, response.status, envelope.code, envelope.request_id);
    }
    throw new TikTokApiError('Falha inesperada na Affiliate Creator API.');
  }
}
