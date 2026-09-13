// Uma única tabela (`tiktok_connections`) guarda dois tipos de conexão OAuth
// completamente diferentes, e é fácil confundi-los:
//
// - `bestsellers_sync`: a conexão (hoje uma loja sandbox) que ALIMENTA a
//   sincronização de dados públicos Bestsellers (services/tiktok/*). Nunca
//   deve ser sobrescrita nem apagada pelo fluxo de "Minha loja".
// - `own_shop`: a conexão da própria loja do usuário ("Minha loja"),
//   implementada nesta etapa. Só prova a autorização — não alimenta nenhuma
//   sincronização ainda.
//
// Toda leitura/escrita em tiktok_connections deve informar explicitamente
// qual propósito quer, nunca um "pega a mais recente de qualquer tipo" (era
// exatamente isso que a implementação anterior fazia, e é o que este arquivo
// existe para evitar).
export type ConnectionPurpose = 'bestsellers_sync' | 'own_shop';

export function parseConnectionPurpose(value: string | string[] | null | undefined): ConnectionPurpose {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'own_shop' ? 'own_shop' : 'bestsellers_sync';
}

// Escopo confirmado pelo próprio usuário como necessário para as futuras
// análises de "Minha loja" — nunca inferido por nós; se a TikTok Shop
// documentar/retornar um nome diferente numa sincronização futura, ajuste
// só aqui.
export const SHOP_ANALYTICS_SCOPE = 'data.shop_analytics.public.read';

/** true só quando o escopo aparece literalmente em `granted_scopes` — nunca assumido por o app "ter" a permissão configurada no Partner Center. */
export function hasShopAnalyticsScope(grantedScopes: readonly string[] | null | undefined): boolean {
  return Array.isArray(grantedScopes) && grantedScopes.includes(SHOP_ANALYTICS_SCOPE);
}

export type OwnShopState = 'not_connected' | 'expired' | 'permission_pending' | 'ready';

export interface OwnShopStatusRow {
  shop_cipher: string | null;
  access_token_expires_at: string | null;
  granted_scopes: string[] | null;
}

/**
 * Estado exibível de "Minha loja", a partir só do que está gravado —
 * nunca "ativo no Partner Center" nem "token antigo ainda deve valer".
 * - `not_connected`: nenhuma autorização concluída ainda.
 * - `expired`: havia uma autorização, mas o access token já venceu — não dá
 *   pra confiar no `granted_scopes` gravado sem reconectar.
 * - `permission_pending`: token válido, mas sem `SHOP_ANALYTICS_SCOPE` no
 *   `granted_scopes` — a loja está autorizada, mas não pronta para análises.
 * - `ready`: token válido E escopo confirmado.
 */
export function resolveOwnShopState(row: OwnShopStatusRow | null | undefined, now: Date = new Date()): OwnShopState {
  if (!row || !row.shop_cipher) return 'not_connected';
  if (!row.access_token_expires_at || new Date(row.access_token_expires_at).getTime() <= now.getTime()) return 'expired';
  if (!hasShopAnalyticsScope(row.granted_scopes)) return 'permission_pending';
  return 'ready';
}

export interface ConfirmedShop {
  cipher: string;
  name?: string;
  region?: string;
}

/**
 * Decide qual loja tratar como "confirmada pela API oficial" após o
 * `getAuthorizedShop` (que pode falhar). A conexão histórica do Bestsellers
 * pode cair de volta no `shop_cipher` já configurado por variável de
 * ambiente (comportamento existente, preservado) — "Minha loja" NUNCA cai
 * nesse fallback: sem confirmação real da API, não existe loja confirmada,
 * ponto. Isso é o que impede uma reconexão de "Minha loja" de herdar
 * silenciosamente o cipher de uma loja diferente.
 */
export function resolveConfirmedShop(input: {
  purpose: ConnectionPurpose;
  liveShop: ConfirmedShop | null;
  staticShopCipher?: string;
  staticFallbackName?: string;
  staticFallbackRegion?: string;
}): ConfirmedShop | null {
  if (input.liveShop) return input.liveShop;
  if (input.purpose === 'bestsellers_sync' && input.staticShopCipher) {
    return { cipher: input.staticShopCipher, name: input.staticFallbackName, region: input.staticFallbackRegion };
  }
  return null;
}
