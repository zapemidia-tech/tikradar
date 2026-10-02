// Tipos, parsing defensivo, paginação e classificação de erro das Affiliate
// Creator APIs — documentação oficial consultada na API do Partner Center
// (partner.tiktokshop.com, document_id por endpoint, workspace_id=3) em
// 2026-09-30:
//   - Get Creator Profile:                 /affiliate_creator/202508/profiles (GET)
//   - Get Showcase Products:                /affiliate_creator/202405/showcases/products (GET)
//   - Search Creator Affiliate Orders:      /affiliate_creator/202410/orders/search (POST)
//     (substituiu Creator Search Affiliate Trace Orders, 202505/orders/trace/search,
//     retirada em 2026-08-15 — confirmado no changelog oficial de depreciação)
//   - Search Creator Target Collaborations: /affiliate_creator/202405/target_collaborations/search (POST)
// Scopes confirmados via document/api_meta oficial (cada endpoint lista os
// scopes que o cobrem; todos os 4 acima são cobertos por pelo menos 1 dos 3
// scopes ativos no app "TikRadar 02" — ver lib/tiktok/connection-purpose.ts):
//   - Get Creator Profile: creator.affiliate.info (ou creator.video.write, não ativo)
//   - Get Showcase Products: creator.showcase.read (ou creator.video.write, não ativo)
//   - Search Creator Affiliate Orders: creator.affiliate_collaboration.read
//   - Search Creator Target Collaborations: creator.affiliate_collaboration.read
//     (requer `shop_id` no corpo, obrigatório — não há, dentro dos 3 scopes
//     ativos, nenhuma API que liste "todas as lojas com que este criador
//     colabora" pra descobrir esse shop_id automaticamente; ver nota em
//     services/tiktok/affiliate-creator-service.ts)

type JsonRecord = Record<string, unknown>;
export const isRecord = (v: unknown): v is JsonRecord => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
/** `{amount, currency}` documentado — `null` se a forma não bater, nunca inventado. */
function money(value: unknown): { amount: string; currency: string } | null {
  if (!isRecord(value)) return null;
  const amount = typeof value.amount === 'string' ? value.amount : undefined;
  const currency = typeof value.currency === 'string' ? value.currency : undefined;
  return amount !== undefined && currency !== undefined ? { amount, currency } : null;
}

// --- Perfil do criador (Get Creator Profile) --------------------------------

export interface CreatorProfile {
  username: string | null;
  avatarUrl: string | null;
  selectionRegion: string | null;
  registerRegion: string | null;
  /** CROSS_BORDER | LOCAL (documentado) — guardado como veio, nunca validado contra a lista. */
  sellerType: string | null;
  /** TIKTOK_SHOP_OFFICIAL_ACCOUNT | TIKTOK_MARKETING_ACCOUNT | TIKTOK_SHOP_CREATOR (documentado). */
  userType: string | null;
  permissions: string[] | null;
  creatorUserOpenId: string | null;
}

export function toCreatorProfile(raw: unknown): CreatorProfile | null {
  if (!isRecord(raw)) return null;
  const data = raw.data;
  if (!isRecord(data)) return null;
  const avatar = data.avatar;
  const permissions = Array.isArray(data.permissions) ? data.permissions.filter((p): p is string => typeof p === 'string') : null;
  return {
    username: str(data.username),
    avatarUrl: isRecord(avatar) ? str(avatar.url) : null,
    selectionRegion: str(data.selection_region),
    registerRegion: str(data.register_region),
    sellerType: str(data.seller_type),
    userType: str(data.user_type),
    permissions,
    creatorUserOpenId: str(data.creator_user_open_id),
  };
}

// --- Produtos da vitrine (Get Showcase Products) ----------------------------

export interface ShowcaseProduct {
  id: string | null;
  title: string | null;
  shopName: string | null;
  mainImageUrl: string | null;
  inventoryStatus: string | null;
  reviewStatus: string | null;
  isHidden: boolean | null;
  source: string | null;
  detailLink: string | null;
  /** Taxa de comissão em centésimos de %: 3000 = 30,00% — guardado como veio (int), formatação fica pra UI. */
  commissionRate: number | null;
  commissionRewardRate: number | null;
}

export function toShowcaseProduct(item: JsonRecord): ShowcaseProduct {
  const shop = item.shop;
  const mainImages = item.main_images;
  const firstImage = Array.isArray(mainImages) && isRecord(mainImages[0]) ? mainImages[0] : null;
  const status = item.status;
  const commission = item.commission;
  return {
    id: str(item.id),
    title: str(item.title),
    shopName: isRecord(shop) ? str(shop.name) : null,
    mainImageUrl: firstImage ? str(firstImage.url) : null,
    inventoryStatus: isRecord(status) ? str(status.inventory_status) : null,
    reviewStatus: isRecord(status) ? str(status.review_status) : null,
    isHidden: isRecord(status) ? bool(status.is_hidden) : null,
    source: str(item.source),
    detailLink: str(item.detail_link),
    commissionRate: isRecord(commission) ? num(commission.rate) : null,
    commissionRewardRate: isRecord(commission) ? num(commission.reward_rate) : null,
  };
}

// --- Pedidos de afiliado (Search Creator Affiliate Orders) -----------------

// Documentado: SHOP | VIDEO | LIVE | PRE_LIVE | PROMOTION_PAGE | LINKSHARE —
// guardado como string livre (nunca validado contra a lista: a API pode
// adicionar um valor novo). É o campo que confirma atribuição OFICIAL por
// vídeo: `content_type==='VIDEO'` + `content_id` presente = a própria
// TikTok está dizendo que esta venda veio deste vídeo. Nunca inferido por
// nome de produto, horário ou qualquer aproximação.
export interface OrderSkuSummary {
  id: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  contentType: string | null;
  contentId: string | null;
  commissionRate: number | null;
  estimatedCommission: { amount: string; currency: string } | null;
  actualCommission: { amount: string; currency: string } | null;
  returnedQuantity: number | null;
  refundedQuantity: number | null;
}

export interface AffiliateOrderSummary {
  id: string | null;
  createTime: number | null;
  /** AWAITING_PAYMENT | TO_SETTLE | SETTLED | REFUNDED | FROZEN | UNSPECIFIED (documentado). Nunca tratamos "comissão pendente" (AWAITING_PAYMENT/TO_SETTLE) como liquidada (SETTLED) — a UI mostra o status real, nunca assume. */
  status: string | null;
  skus: OrderSkuSummary[];
}

function toOrderSku(raw: unknown): OrderSkuSummary | null {
  if (!isRecord(raw)) return null;
  return {
    id: str(raw.id),
    productId: str(raw.product_id),
    productName: str(raw.product_name),
    quantity: num(raw.quantity),
    contentType: str(raw.content_type),
    contentId: str(raw.content_id),
    commissionRate: num(raw.commission_rate),
    estimatedCommission: money(raw.estimated_commission),
    actualCommission: money(raw.actual_commission),
    returnedQuantity: num(raw.returned_quantity),
    refundedQuantity: num(raw.refunded_quantity),
  };
}

export function toAffiliateOrder(item: JsonRecord): AffiliateOrderSummary {
  const skusRaw = item.skus;
  const skus = Array.isArray(skusRaw) ? skusRaw.map(toOrderSku).filter((s): s is OrderSkuSummary => s !== null) : [];
  return { id: str(item.id), createTime: num(item.create_time), status: str(item.status), skus };
}

/** Linha agregada por vídeo — só existe quando há >=1 SKU com `contentType==='VIDEO'` e `contentId` presente em algum pedido. Classificação completa em docs/tiktok-affiliate-creator-fields.md. */
export interface VideoSalesAggregate {
  contentId: string;
  orderCount: number;
  unitsSold: number;
  /** Somado por moeda — nunca soma moedas diferentes num só número. */
  estimatedCommission: { currency: string; amount: number }[];
  actualCommission: { currency: string; amount: number }[];
}

/**
 * Agrega vendas por vídeo a partir de SKUs com atribuição oficial
 * (`contentType==='VIDEO'` + `contentId`). Nunca inclui pedidos sem essa
 * atribuição explícita — eles não entram em nenhuma linha do resultado
 * (ficam só no agregado "sem atribuição", calculado por quem chama, nunca
 * aqui, pra deixar claro o que é oficial vs. o resto).
 */
export function aggregateVideoSales(orders: AffiliateOrderSummary[]): VideoSalesAggregate[] {
  const byVideo = new Map<string, { orderIds: Set<string>; units: number; estimated: Map<string, number>; actual: Map<string, number> }>();
  for (const order of orders) {
    for (const sku of order.skus) {
      if (sku.contentType !== 'VIDEO' || !sku.contentId) continue;
      let entry = byVideo.get(sku.contentId);
      if (!entry) {
        entry = { orderIds: new Set(), units: 0, estimated: new Map(), actual: new Map() };
        byVideo.set(sku.contentId, entry);
      }
      if (order.id) entry.orderIds.add(order.id);
      if (sku.quantity !== null) entry.units += sku.quantity;
      if (sku.estimatedCommission) {
        const n = Number(sku.estimatedCommission.amount);
        if (Number.isFinite(n)) entry.estimated.set(sku.estimatedCommission.currency, (entry.estimated.get(sku.estimatedCommission.currency) ?? 0) + n);
      }
      if (sku.actualCommission) {
        const n = Number(sku.actualCommission.amount);
        if (Number.isFinite(n)) entry.actual.set(sku.actualCommission.currency, (entry.actual.get(sku.actualCommission.currency) ?? 0) + n);
      }
    }
  }
  return [...byVideo.entries()].map(([contentId, e]) => ({
    contentId,
    orderCount: e.orderIds.size,
    unitsSold: e.units,
    estimatedCommission: [...e.estimated.entries()].map(([currency, amount]) => ({ currency, amount })),
    actualCommission: [...e.actual.entries()].map(([currency, amount]) => ({ currency, amount })),
  }));
}

// --- Colaborações (Search Creator Target Collaborations) -------------------

export interface TargetCollaborationProduct {
  id: string | null;
  title: string | null;
  mainImageUrl: string | null;
  commissionRate: number | null;
  commissionAmount: { amount: string; currency: string } | null;
}

export interface TargetCollaboration {
  id: string | null;
  name: string | null;
  /** LIVE | EXPIRED | DELETED | ENDED (documentado). */
  status: string | null;
  products: TargetCollaborationProduct[];
}

export function toTargetCollaboration(item: JsonRecord): TargetCollaboration {
  const productsRaw = item.products;
  const products = Array.isArray(productsRaw)
    ? productsRaw.filter(isRecord).map(
        (p): TargetCollaborationProduct => ({
          id: str(p.id),
          title: str(p.title),
          mainImageUrl: str(p.main_image_url),
          commissionRate: isRecord(p.commission) ? num(p.commission.rate) : null,
          commissionAmount: isRecord(p.commission) ? money({ amount: p.commission.amount, currency: p.commission.currency }) : null,
        }),
      )
    : [];
  return { id: str(item.id), name: str(item.name), status: str(item.status), products };
}

// --- Página paginada genérica (Showcase Products / Orders / Collaborations) ---

export interface AffiliateCreatorPage<T> {
  items: T[];
  observedFields: string[];
  totalCount: number | null;
  nextPageToken: string | null;
}

/**
 * Extrai `data[arrayKey]` de forma defensiva — mesmo raciocínio de
 * `parseAnalyticsPage` (lib/tiktok/shop-analytics.ts): só falha (retorna
 * null) se a lista não existir/for do tipo errado, nunca por um campo
 * secundário ausente. Diferente de shop-analytics: aqui NÃO se aplica a
 * exceção documentada de "chave omitida quando total_count=0" (nunca
 * observada nestas APIs de criador) — se algum dia for confirmada em
 * produção, documentar e tratar aqui, nunca assumir preventivamente.
 */
export function parseAffiliateCreatorPage<T>(raw: unknown, arrayKey: string, toSummary: (item: JsonRecord) => T): AffiliateCreatorPage<T> | null {
  if (!isRecord(raw)) return null;
  const data = raw.data;
  if (!isRecord(data)) return null;
  const items = data[arrayKey];
  if (!Array.isArray(items)) return null;
  const jsonItems = items.filter(isRecord);
  return {
    items: jsonItems.map(toSummary),
    observedFields: jsonItems[0] ? Object.keys(jsonItems[0]) : [],
    totalCount: num(data.total_count),
    nextPageToken: str(data.next_page_token),
  };
}

// --- Classificação de erro ---------------------------------------------------
// Códigos OAuth/comuns confirmados no "Creator authorization guide" oficial
// (2026-09-30): 105005 (scope faltando), 105002 (token expirado), 105001
// (token inválido/revogado), 101000 (token do tipo errado / par
// API-token errado). Códigos específicos por endpoint, confirmados nas
// páginas oficiais de cada API: Get Creator Profile (16015006, 16015007,
// 16501011, 16504002, 36009002), Get Showcase Products (18001405, 36009003).

const PERMISSION_DENIED_CODE = 105005;
const TOKEN_EXPIRED_CODE = 105002;
const TOKEN_INVALID_CODE = 105001;
const WRONG_TOKEN_IDENTITY_CODE = 101000;

export type AffiliateCreatorErrorKind = 'insufficient_permission' | 'token_expired' | 'token_invalid' | 'wrong_token_identity' | 'unexpected_format' | 'api_error';

export interface ClassifiedAffiliateCreatorError {
  kind: AffiliateCreatorErrorKind;
  code?: number;
  status?: number;
  message: string;
  shape?: Record<string, unknown>;
}

/** Classifica um erro já lançado por TikTokCreatorClient.request, por um erro de formato inesperado, ou qualquer outro erro — nunca finge saber o motivo além do que está confirmado nos 4 códigos oficiais acima. */
export function classifyAffiliateCreatorError(error: unknown): ClassifiedAffiliateCreatorError {
  const code = isRecord(error) && typeof error.code === 'number' ? error.code : undefined;
  const status = isRecord(error) && typeof error.status === 'number' ? error.status : undefined;
  const message = error instanceof Error ? error.message : 'Erro desconhecido.';
  if (code === PERMISSION_DENIED_CODE) return { kind: 'insufficient_permission', code, status, message };
  if (code === TOKEN_EXPIRED_CODE) return { kind: 'token_expired', code, status, message };
  if (code === TOKEN_INVALID_CODE) return { kind: 'token_invalid', code, status, message };
  if (code === WRONG_TOKEN_IDENTITY_CODE) return { kind: 'wrong_token_identity', code, status, message };
  if (isRecord(error) && error.name === 'TikTokSchemaError') {
    const details = isRecord(error.details) ? error.details : undefined;
    const shape = details && isRecord(details.shape) ? (details.shape as Record<string, unknown>) : undefined;
    return { kind: 'unexpected_format', code, status, message, shape };
  }
  return { kind: 'api_error', code, status, message };
}
