// Uma única tabela (`tiktok_connections`) guarda TRÊS tipos de conexão OAuth
// completamente diferentes, e é fácil confundi-los:
//
// - `bestsellers_sync`: a conexão (hoje uma loja sandbox) que ALIMENTA a
//   sincronização de dados públicos Bestsellers (services/tiktok/*). Nunca
//   deve ser sobrescrita nem apagada pelo fluxo de "Minha loja".
// - `own_shop`: a conexão da própria loja do usuário ("Minha loja"). Só
//   prova a autorização de vendedor — não alimenta nenhuma sincronização.
// - `affiliate_creator`: a conexão da própria conta de CRIADOR AFILIADO do
//   usuário ("Minha conta de afiliado"), via um app TikTok Shop SEPARADO
//   ("TikRadar 02" — credenciais TIKTOK_CREATOR_APP_KEY/SECRET, nunca as do
//   app seller). Um token de criador nunca é usado num endpoint de seller,
//   nem vice-versa (ver lib/tiktok/creator-client.ts) — são identidades e
//   credenciais diferentes, mesmo quando pertencem ao mesmo platform_user_id.
//
// Toda leitura/escrita em tiktok_connections deve informar explicitamente
// qual propósito quer, nunca um "pega a mais recente de qualquer tipo" (era
// exatamente isso que a implementação anterior fazia, e é o que este arquivo
// existe para evitar).
export type ConnectionPurpose = 'bestsellers_sync' | 'own_shop' | 'affiliate_creator';

// Só resolve entre os 2 propósitos do fluxo OAuth SELLER compartilhado
// (/api/tiktok/oauth/authorize?purpose=...) — nunca retorna
// 'affiliate_creator' por engano, mesmo que alguém passe
// `?purpose=affiliate_creator` nessa rota. O fluxo de criador tem suas
// PRÓPRIAS rotas dedicadas (/api/tiktok/creator/oauth/*), que usam
// 'affiliate_creator' diretamente, sem passar por este parser.
export function parseConnectionPurpose(value: string | string[] | null | undefined): Exclude<ConnectionPurpose, 'affiliate_creator'> {
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

// --- Affiliate creator ("Minha conta de afiliado") -------------------------
//
// Os 3 scopes ATIVOS confirmados pelo usuário no app "TikRadar 02" (Partner
// Center, categoria Serviço personalizado → Engajamento do cliente →
// Colaborações do criador, mercado BR). Nunca inferidos — se a TikTok
// documentar/exigir um scope diferente no futuro, ajuste só aqui. Cada um
// cobre endpoints diferentes (confirmado via document/api_meta oficial,
// 2026-09-30):
//   - creator.affiliate.info            -> Get Creator Profile
//   - creator.showcase.read             -> Get Showcase Products
//   - creator.affiliate_collaboration.read -> Search Creator Affiliate Orders,
//                                             Search Creator Target Collaborations
export const AFFILIATE_CREATOR_SCOPES = ['creator.affiliate.info', 'creator.showcase.read', 'creator.affiliate_collaboration.read'] as const;
export type AffiliateCreatorScope = (typeof AFFILIATE_CREATOR_SCOPES)[number];

/** Quais dos 3 scopes esperados estão de fato em `granted_scopes` — nunca assume presença por o app "ter" o scope habilitado no Partner Center. */
export function grantedAffiliateCreatorScopes(grantedScopes: readonly string[] | null | undefined): Record<AffiliateCreatorScope, boolean> {
  const set = new Set(grantedScopes ?? []);
  return Object.fromEntries(AFFILIATE_CREATOR_SCOPES.map((s) => [s, set.has(s)])) as Record<AffiliateCreatorScope, boolean>;
}

/** true só quando os 3 scopes esperados estão TODOS presentes — autorização parcial (documentada como possível pela própria TikTok) não conta como pronta, já que falta qualquer um deles já quebra alguma chamada do painel. */
export function hasAllAffiliateCreatorScopes(grantedScopes: readonly string[] | null | undefined): boolean {
  return Object.values(grantedAffiliateCreatorScopes(grantedScopes)).every(Boolean);
}

export type AffiliateCreatorState = 'not_connected' | 'expired' | 'permission_pending' | 'ready';

export interface AffiliateCreatorStatusRow {
  open_id: string | null;
  access_token_expires_at: string | null;
  granted_scopes: string[] | null;
}

/**
 * Estado exibível de "Minha conta de afiliado", a partir só do que está
 * gravado. Diferente de `resolveOwnShopState`: não existe `shop_cipher` pra
 * criador (criador não tem loja) — a existência da conexão é checada por
 * `access_token_expires_at` (coluna NOT NULL na tabela; só existe depois de
 * um `save()` bem-sucedido, para qualquer propósito).
 * - `not_connected`: nenhuma autorização concluída ainda.
 * - `expired`: havia uma autorização, mas o access token já venceu.
 * - `permission_pending`: token válido, mas falta ao menos 1 dos 3 scopes
 *   esperados em `granted_scopes` (autorização parcial).
 * - `ready`: token válido E os 3 scopes confirmados.
 */
export function resolveAffiliateCreatorState(row: AffiliateCreatorStatusRow | null | undefined, now: Date = new Date()): AffiliateCreatorState {
  if (!row || !row.access_token_expires_at) return 'not_connected';
  if (new Date(row.access_token_expires_at).getTime() <= now.getTime()) return 'expired';
  if (!hasAllAffiliateCreatorScopes(row.granted_scopes)) return 'permission_pending';
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
