// Tipos, parsing defensivo e classificação de erro para as APIs de
// performance da PRÓPRIA loja (não confundir com o Bestsellers, que é
// ranking público — ver lib/tiktok/connection-purpose.ts).
//
// Duas versões documentadas e REALMENTE existentes para cada endpoint —
// confirmado baixando o Markdown oficial de cada página (o botão "Download
// Markdown" do Partner Center, que dá o texto completo sem o corte que o
// editor de código renderizado em JS causa) em 2026-09-14:
//
//   Vídeo:   preferida 202605, anterior 202509
//   Produto: preferida 202605, anterior 202509 (havia uma 202405 ainda mais
//            antiga, mas o changelog oficial da 202605 — partner.tiktokshop.
//            com/docv2/page/kpkfccsa — descreve 202509 como "a versão
//            anterior" de produtos também; não há motivo pra manter uma 3ª
//            versão como fallback quando a documentação oficial só reconhece
//            duas gerações em uso)
//
// A versão 202605 ("Analytics API Response Data Optimization") acrescenta:
//   - Vídeo: `creator{open_id,user_name,nick_name,author_type}` — é a
//     identificação de criador que a versão 202509 NÃO tem.
//   - Produto: troca o `overall_performance{gmv,items_sold,orders}` enxuto
//     da 202509 por `total_performance` (dezenas de métricas de funil:
//     impressões, cliques, CTR, add-to-cart, reembolsos...) + 6 blocos de
//     performance por canal (`seller_live_performance`,
//     `seller_video_performance`, `seller_product_card_performance`,
//     `affiliate_total_performance`, `affiliate_live_performance`,
//     `affiliate_video_performance`) + `shop_tab_performance`. A API de
//     produto NUNCA traz identificação de criador, em nenhuma versão — só a
//     de vídeo traz.
//
// O app pode não ter a 202605 habilitada no Partner Center mesmo a doc
// pública existindo (o seletor de versões da ferramenta de teste só mostra
// o que está habilitado para o app específico — nunca é prova de que uma
// versão documentada não existe de verdade, só de que este app não a usa
// ainda). Por isso o serviço (shop-analytics-service.ts) tenta 202605
// primeiro e cai para 202509 automaticamente SÓ quando a própria TikTok
// responde que a versão/rota é inválida (ver `isVersionUnavailableError`)
// — nunca mistura campo de uma versão com o de outra.

export type ShopAnalyticsApiVersion = '202605' | '202509';

export const SHOP_VIDEO_PERFORMANCE_PATH: Record<ShopAnalyticsApiVersion, string> = {
  '202605': '/analytics/202605/shop_videos/performance',
  '202509': '/analytics/202509/shop_videos/performance',
};
export const SHOP_PRODUCT_PERFORMANCE_PATH: Record<ShopAnalyticsApiVersion, string> = {
  '202605': '/analytics/202605/shop_products/performance',
  '202509': '/analytics/202509/shop_products/performance',
};

export interface AnalyticsPageParams {
  startDateGe: string; // YYYY-MM-DD, inclusivo
  endDateLt: string; // YYYY-MM-DD, exclusivo
  pageSize?: number; // máx. 100 (documentado, igual nas duas versões)
  pageToken?: string;
  sortField?: string;
  sortOrder?: 'ASC' | 'DESC';
  currency?: 'USD' | 'LOCAL';
}

type JsonRecord = Record<string, unknown>;
export const isRecord = (v: unknown): v is JsonRecord => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** `{amount, currency}` documentado (gmv/gpm/aov/...) — `null` se a forma não bater, nunca inventado. */
function money(value: unknown): { amount: string; currency: string } | null {
  if (!isRecord(value)) return null;
  const amount = typeof value.amount === 'string' ? value.amount : undefined;
  const currency = typeof value.currency === 'string' ? value.currency : undefined;
  return amount !== undefined && currency !== undefined ? { amount, currency } : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function idString(value: unknown): string | null {
  // Documentado como string nas duas versões atuais (202509/202605) — a 202405
  // (fora de uso aqui) tinha id numérico; aceitar os dois formatos é só
  // defensivo, nunca reinterpreta o valor.
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Página já normalizada de qualquer uma das duas APIs, em qualquer versão — `items` fica
 * como `unknown[]` (o chamador sabe qual endpoint/versão pediu e usa `toVideoSummary`/
 * `toProductSummary` com a MESMA versão pra extrair os campos certos). */
export interface AnalyticsPage {
  items: JsonRecord[];
  /** Nomes de campo (nível raiz de cada item) realmente presentes no 1º item — [] se a página vier vazia. */
  observedFields: string[];
  totalCount: number | null;
  nextPageToken: string | null;
  /** Data mais recente com dado disponível, segundo a própria TikTok (campo `latest_available_date`) — não confiar em suposição própria de "hoje". */
  latestAvailableDate: string | null;
}

/** Extrai `data.videos`/`data.products` (conforme `arrayKey`) de forma defensiva —
 * nunca lança por um campo secundário ausente; só falha (retorna null) se a
 * própria lista não existir/for do tipo errado, o que sinaliza formato
 * inesperado para o chamador tratar como "erro da API". Igual nas duas
 * versões — só o conteúdo de cada item muda entre elas. */
export function parseAnalyticsPage(raw: unknown, arrayKey: 'videos' | 'products'): AnalyticsPage | null {
  if (!isRecord(raw)) return null;
  const data = raw.data;
  if (!isRecord(data)) return null;
  const items = data[arrayKey];
  if (!Array.isArray(items)) return null;
  const jsonItems = items.filter(isRecord);
  return {
    items: jsonItems,
    observedFields: jsonItems[0] ? Object.keys(jsonItems[0]) : [],
    totalCount: num(data.total_count),
    nextPageToken: str(data.next_page_token) || null,
    latestAvailableDate: str(data.latest_available_date),
  };
}

/** `typeof`/forma de um valor, sem NUNCA incluir o próprio valor — usado só em
 * `describeSanitizedResponseShape` pra descrever `data.videos`/`data.products`
 * sem arriscar vazar conteúdo (ex.: se um dia vier um objeto ali por engano). */
function describeShape(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}

/** Metadados sanitizados da resposta bruta da TikTok — SÓ nomes de chave e tipos,
 * nunca valores. Existe para logar no servidor quando `parseAnalyticsPage` falha
 * (formato inesperado) sem nunca arriscar registrar token, App Secret, shop_cipher
 * completo ou qualquer outro dado do payload — mesmo que o payload real tivesse
 * algum desses valores num lugar inesperado, só as CHAVES são lidas aqui, nunca
 * os valores (exceto `code`/`message`/`request_id`, que a própria doc oficial
 * descreve como não sensíveis: status/mensagem de erro e um id de log). */
export interface SanitizedResponseShape {
  code: number | null;
  message: string | null;
  hasRequestId: boolean;
  /** Nomes de chave no nível raiz do envelope (ex.: code, message, data, request_id). */
  rootKeys: string[];
  /** Nomes de chave em `data` — null se `data` não é um objeto (ausente, null, array, etc.). */
  dataKeys: string[] | null;
  /** Qual chave foi checada (o que o chamador pediu pra extrair) e a forma do valor encontrado nela. */
  arrayKey: 'videos' | 'products';
  arrayValueShape: string;
}

export function describeSanitizedResponseShape(raw: unknown, arrayKey: 'videos' | 'products'): SanitizedResponseShape {
  const data = isRecord(raw) ? raw.data : undefined;
  return {
    code: isRecord(raw) && typeof raw.code === 'number' ? raw.code : null,
    message: isRecord(raw) && typeof raw.message === 'string' ? raw.message : null,
    hasRequestId: isRecord(raw) && typeof raw.request_id === 'string' && raw.request_id.length > 0,
    rootKeys: isRecord(raw) ? Object.keys(raw) : [],
    dataKeys: isRecord(data) ? Object.keys(data) : null,
    arrayKey,
    arrayValueShape: describeShape(isRecord(data) ? data[arrayKey] : undefined),
  };
}

// --- Vídeo -----------------------------------------------------------------

export interface VideoCreatorInfo {
  openId: string | null;
  userName: string | null;
  nickName: string | null;
  authorType: string | null; // OFFICIAL | CHANNEL | AFFILIATE (documentado) — guardado como veio, nunca validado contra a lista (a API pode acrescentar um valor novo)
}

export interface VideoPerformanceSummary {
  version: ShopAnalyticsApiVersion;
  id: string | null;
  title: string | null;
  videoPostTime: string | null;
  durationSeconds: number | null;
  gmv: { amount: string; currency: string } | null;
  gpm: { amount: string; currency: string } | null;
  views: number | null;
  itemsSold: number | null;
  clickThroughRate: string | null;
  productCount: number | null;
  /** Só existe na 202605 — `null` na 202509 (a API nunca omite por acaso: a versão antiga simplesmente não tem esse campo). */
  creator: VideoCreatorInfo | null;
}

export function toVideoSummary(item: JsonRecord, version: ShopAnalyticsApiVersion): VideoPerformanceSummary {
  const products = item.products;
  const creatorRaw = version === '202605' ? item.creator : undefined;
  const creator = isRecord(creatorRaw)
    ? { openId: str(creatorRaw.open_id), userName: str(creatorRaw.user_name), nickName: str(creatorRaw.nick_name), authorType: str(creatorRaw.author_type) }
    : null;
  return {
    version,
    id: idString(item.id),
    title: str(item.title),
    videoPostTime: str(item.video_post_time),
    durationSeconds: num(item.duration),
    gmv: money(item.gmv),
    gpm: money(item.gpm),
    views: num(item.views),
    itemsSold: num(item.items_sold),
    clickThroughRate: str(item.click_through_rate),
    productCount: Array.isArray(products) ? products.length : null,
    creator,
  };
}

// --- Produto -----------------------------------------------------------

/** 202509: só o resumo (`overall_performance`) — sem funil, sem canais, sem criador. */
export interface ProductOverallPerformance {
  gmv: { amount: string; currency: string } | null;
  orders: number | null;
  itemsSold: number | null;
}

/** 202605: `total_performance` (funil completo) + confirmação de quais blocos de canal vieram. Os
 * blocos de canal (`seller_live_performance` etc.) não são achatados aqui campo a campo — são
 * ~80 métricas ao todo entre os 7 blocos; o diagnóstico mostra a presença deles via
 * `channelsWithData` e os nomes reais em `observedFields` (AnalyticsPage), nunca inventando
 * quais vieram preenchidos. */
export interface ProductTotalPerformance {
  gmv: { amount: string; currency: string } | null;
  orders: number | null;
  skuOrders: number | null;
  itemsSold: number | null;
  productImpressions: number | null;
  productClicks: number | null;
  ctr: string | null;
  addCartRate: string | null;
  clickOrderRate: string | null;
  estimatedCustomers: number | null;
}

const PRODUCT_CHANNEL_KEYS = [
  'seller_live_performance',
  'seller_video_performance',
  'seller_product_card_performance',
  'affiliate_total_performance',
  'affiliate_live_performance',
  'affiliate_video_performance',
  'shop_tab_performance',
] as const;

export type ProductPerformanceSummary =
  | { version: '202509'; id: string | null; overallPerformance: ProductOverallPerformance | null }
  | { version: '202605'; id: string | null; totalPerformance: ProductTotalPerformance | null; channelsWithData: string[] };

export function toProductSummary(item: JsonRecord, version: ShopAnalyticsApiVersion): ProductPerformanceSummary {
  const id = idString(item.id);
  if (version === '202509') {
    const op = item.overall_performance;
    const overallPerformance = isRecord(op) ? { gmv: money(op.gmv), orders: num(op.orders), itemsSold: num(op.items_sold) } : null;
    return { version, id, overallPerformance };
  }
  const tp = item.total_performance;
  const totalPerformance = isRecord(tp)
    ? {
        gmv: money(tp.gmv),
        orders: num(tp.orders),
        skuOrders: num(tp.sku_orders),
        itemsSold: num(tp.items_sold),
        productImpressions: num(tp.product_impressions),
        productClicks: num(tp.product_clicks),
        ctr: str(tp.ctr),
        addCartRate: str(tp.add_cart_rate),
        clickOrderRate: str(tp.click_order_rate),
        estimatedCustomers: num(tp.estimated_customers),
      }
    : null;
  const channelsWithData = PRODUCT_CHANNEL_KEYS.filter((k) => isRecord(item[k]));
  return { version, id, totalPerformance, channelsWithData };
}

// --- Classificação de erro -------------------------------------------------
// Códigos confirmados na página oficial "common error codes"
// (partner.tiktokshop.com/docv2/page/678e3a45786253031531b942, consultada em
// 2026-09-14) e no Error Code de cada endpoint — nunca inferidos.
const PERMISSION_DENIED_CODE = 105005; // "Access denied... access scopes... do not contain the required access scope"
const TOKEN_EXPIRED_CODE = 105002; // "Expired credentials. The access_token ... has expired."
const INVALID_PERIOD_CODE = 28001022; // "invalid request params; detail: start time or end time is invalid." (Error Code de cada endpoint)
const INVALID_PATH_CODE = 36009009; // "Invalid path. The specified path does not match any available endpoint."
const INVALID_VERSION_CODES = [36009014, 36009004]; // "Invalid API version..." — 36009004 é reaproveitado p/ várias mensagens, só conta combinado com a mensagem

// 'unexpected_format' é DIFERENTE de 'api_error': a TikTok respondeu sucesso
// (HTTP ok + code 0), só que data.videos/data.products não veio no formato
// documentado — nunca deve ser confundido com um erro de negócio real da
// TikTok (esses têm code e caem nas outras categorias, ou em 'api_error' se
// o code não bater com nenhum dos 3 confirmados).
export type ShopAnalyticsErrorKind = 'insufficient_permission' | 'token_expired' | 'invalid_period' | 'unexpected_format' | 'api_error';

export interface ClassifiedShopAnalyticsError {
  kind: ShopAnalyticsErrorKind;
  code?: number;
  status?: number;
  message: string;
  /** Só presente quando kind==='unexpected_format' — metadados sanitizados (nunca o payload) da resposta que não bateu com o formato documentado. */
  shape?: SanitizedResponseShape;
}

function asSanitizedResponseShape(value: unknown): SanitizedResponseShape | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.arrayKey !== 'string' || typeof value.arrayValueShape !== 'string') return undefined;
  return value as unknown as SanitizedResponseShape;
}

/** Classifica um erro já lançado por TikTokShopClient.request (TikTokApiError/TikTokRateLimitError),
 * por TikTokSchemaError (formato inesperado — ver getShopVideoPerformancePage/getShopProductPerformancePage
 * em shop-analytics-service.ts) ou qualquer outro erro inesperado — nunca finge saber o motivo além do
 * que está confirmado. */
export function classifyShopAnalyticsError(error: unknown): ClassifiedShopAnalyticsError {
  const code = isRecord(error) && typeof error.code === 'number' ? error.code : undefined;
  const status = isRecord(error) && typeof error.status === 'number' ? error.status : undefined;
  const message = error instanceof Error ? error.message : 'Erro desconhecido.';
  if (code === PERMISSION_DENIED_CODE) return { kind: 'insufficient_permission', code, status, message };
  if (code === TOKEN_EXPIRED_CODE) return { kind: 'token_expired', code, status, message };
  if (code === INVALID_PERIOD_CODE) return { kind: 'invalid_period', code, status, message };
  if (isRecord(error) && error.name === 'TikTokSchemaError') {
    const details = isRecord(error) ? error.details : undefined;
    const shape = asSanitizedResponseShape(isRecord(details) ? details.shape : undefined);
    return { kind: 'unexpected_format', code, status, message, shape };
  }
  return { kind: 'api_error', code, status, message };
}

/**
 * true só quando o erro indica que a VERSÃO/rota chamada não existe pra este
 * app (nunca por qualquer outro motivo — período inválido, permissão etc.
 * têm código próprio e não caem aqui). Usada só pelo fallback automático de
 * versão (202605 -> 202509), nunca pelos 6 estados finais do diagnóstico.
 */
export function isVersionUnavailableError(error: unknown): boolean {
  const code = isRecord(error) && typeof error.code === 'number' ? error.code : undefined;
  const message = error instanceof Error ? error.message : '';
  if (code === INVALID_PATH_CODE) return true;
  if (code !== undefined && INVALID_VERSION_CODES.includes(code) && /invalid api version/i.test(message)) return true;
  return false;
}

// --- Paginação ---------------------------------------------------------
// Limite de segurança: um diagnóstico nunca deve virar uma varredura
// completa do catálogo (isso é trabalho de uma sincronização futura, fora
// do escopo desta etapa) — só o suficiente pra confirmar que a paginação
// funciona e dar uma amostra real.
export const DIAGNOSTIC_MAX_PAGES = 3;

export interface PaginationResult<T> {
  items: T[];
  pagesFetched: number;
  /** true se parou por atingir DIAGNOSTIC_MAX_PAGES com mais páginas disponíveis (next_page_token ainda presente). */
  truncatedByPageLimit: boolean;
  lastPage: AnalyticsPage | null;
}

/**
 * Segue `next_page_token` até `maxPages` (inclusive a 1ª) ou até a API
 * parar de devolver um token. `fetchPage(pageToken)` é responsabilidade do
 * chamador (aqui não faz nenhuma chamada de rede — testável sem mock de HTTP).
 *
 * `seedPage`, quando informado, é usado como a 1ª página em vez de chamar
 * `fetchPage(undefined)` — para quando ela já foi buscada por outro motivo
 * (aqui, pelo fallback de versão 202605→202509 em shop-analytics-service.ts,
 * que precisa da 1ª página pra descobrir qual versão respondeu antes de
 * paginar o resto com essa mesma versão).
 */
export async function collectPaginated<T>(
  fetchPage: (pageToken: string | undefined) => Promise<AnalyticsPage>,
  toSummary: (item: JsonRecord) => T,
  maxPages: number = DIAGNOSTIC_MAX_PAGES,
  seedPage?: AnalyticsPage,
): Promise<PaginationResult<T>> {
  const items: T[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;
  let lastPage: AnalyticsPage | null = null;
  let truncatedByPageLimit = false;

  while (pagesFetched < maxPages) {
    const page = pagesFetched === 0 && seedPage ? seedPage : await fetchPage(pageToken);
    lastPage = page;
    pagesFetched++;
    for (const item of page.items) items.push(toSummary(item));
    if (!page.nextPageToken) break;
    if (pagesFetched >= maxPages) {
      truncatedByPageLimit = true;
      break;
    }
    pageToken = page.nextPageToken;
  }

  return { items, pagesFetched, truncatedByPageLimit, lastPage };
}
