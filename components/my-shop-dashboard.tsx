'use client';

// Painel "Minha loja" — consome só /api/tiktok/own-shop/dashboard, que por
// sua vez usa EXCLUSIVAMENTE a conexão own_shop do usuário autenticado (ver
// esse route.ts e services/tiktok/shop-dashboard-service.ts). Nunca lê nada
// do Bestsellers (Radar/Lojas/Criadores) — são fontes de dados diferentes:
// aqui é privado (a própria loja), lá é público (ranking Bestsellers).
//
// Tipos abaixo duplicam (não importam) os tipos do servidor — mesmo padrão
// já usado em components/shop-analytics-diagnostic.tsx: o componente cliente
// nunca importa módulos server-only, e o formato da API é o contrato real.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Lock, RefreshCw, ShieldAlert, Store } from 'lucide-react';
import { compact, fullDate, moneyByCurrency, NA, text } from '@/lib/format';
import { LoadingState } from '@/components/state-message';

// --- Contrato da API (espelha lib/tiktok/shop-analytics.ts) ----------------

type ConnectionStatus = 'not_connected' | 'token_expired' | 'permission_pending' | 'ready';
interface ConnectionInfo {
  status: ConnectionStatus;
  sellerName?: string;
  sellerBaseRegion?: string;
  timeZone?: string;
}
interface AnalyticsWindow {
  startDateGe: string;
  endDateLt: string;
}
type PeriodError = 'invalid_dates' | 'start_after_end' | 'range_too_wide' | 'includes_unavailable_period';

interface Money {
  amount: string;
  currency: string;
}
interface VideoCreatorInfo {
  openId: string | null;
  userName: string | null;
  nickName: string | null;
  authorType: string | null;
}
interface VideoSummary {
  id: string | null;
  title: string | null;
  username: string | null;
  videoPostTime: string | null;
  durationSeconds: number | null;
  hashTags: string[] | null;
  gmv: Money | null;
  gpm: Money | null;
  avgCustomers: number | null;
  skuOrders: number | null;
  views: number | null;
  itemsSold: number | null;
  clickThroughRate: string | null;
  productCount: number | null;
  creator: VideoCreatorInfo | null;
}

interface ChannelPerformance {
  channel: string;
  attributedGmv: Money | null;
  attributedOrders: number | null;
  productImpressions: number | null;
  productClicks: number | null;
  ctr: string | null;
  addCartRate: string | null;
}
interface ShopTabPerformance {
  productImpressions: number | null;
  productClicks: number | null;
  uniqueProductClicks: number | null;
  estimatedCustomers: number | null;
  ctr: string | null;
  gmv: Money | null;
  itemsSold: number | null;
}
interface ProductTotalPerformance {
  gmv: Money | null;
  orders: number | null;
  skuOrders: number | null;
  itemsSold: number | null;
  productImpressions: number | null;
  productClicks: number | null;
  ctr: string | null;
  addCartRate: string | null;
  clickOrderRate: string | null;
  estimatedCustomers: number | null;
  aov: Money | null;
  refunds: Money | null;
  refundedItems: number | null;
}
interface ProductSummary {
  id: string | null;
  totalPerformance: ProductTotalPerformance | null;
  channelsWithData: string[];
  channels: ChannelPerformance[];
  shopTab: ShopTabPerformance | null;
}

type EndpointErrorOutcome = 'insufficient_permission' | 'token_expired' | 'invalid_period' | 'unexpected_format' | 'api_error';
type EndpointResult<T> =
  | { outcome: EndpointErrorOutcome; code?: number; status?: number; message: string }
  | {
      outcome: 'success_with_data' | 'success_empty';
      latestAvailableDate: string | null;
      totalCount: number | null;
      itemCount: number;
      pagesFetched: number;
      truncatedByPageLimit: boolean;
      items: T[];
    };

interface DashboardResponse {
  error?: string;
  connection: ConnectionInfo;
  queriedWindow?: AnalyticsWindow;
  periodError?: PeriodError;
  video?: EndpointResult<VideoSummary>;
  product?: EndpointResult<ProductSummary>;
}

function isSuccessResult<T>(r: EndpointResult<T> | undefined): r is Extract<EndpointResult<T>, { outcome: 'success_with_data' | 'success_empty' }> {
  return r?.outcome === 'success_with_data' || r?.outcome === 'success_empty';
}

const ENDPOINT_ERROR_LABEL: Record<EndpointErrorOutcome, string> = {
  insufficient_permission: 'Permissão insuficiente',
  token_expired: 'Token expirado — reconecte',
  invalid_period: 'Período inválido para a TikTok',
  unexpected_format: 'A TikTok respondeu em formato inesperado',
  api_error: 'Erro da API',
};

const PERIOD_ERROR_LABEL: Record<PeriodError, string> = {
  invalid_dates: 'Datas inválidas — use o formato AAAA-MM-DD.',
  start_after_end: 'A data inicial precisa ser antes da data final.',
  range_too_wide: 'Período maior que o limite aceito pela TikTok para esta API.',
  includes_unavailable_period: 'O fim do período inclui dias que a TikTok ainda não processou — escolha uma data final mais antiga.',
};

const CHANNEL_LABEL: Record<string, string> = {
  seller_live_performance: 'Live própria',
  seller_video_performance: 'Vídeo próprio',
  seller_product_card_performance: 'Card de produto',
  affiliate_total_performance: 'Afiliados (total)',
  affiliate_live_performance: 'Live de afiliado',
  affiliate_video_performance: 'Vídeo de afiliado',
  shop_tab_performance: 'Aba da loja',
};

const PERIOD_PRESETS = [
  { spanDays: 7, label: '7 dias' },
  { spanDays: 14, label: '14 dias' },
  { spanDays: 30, label: '30 dias' },
  { spanDays: 90, label: '90 dias' },
] as const;

/** Mesma conta de `computeReferenceDate`/`defaultAnalyticsWindow` (lib/tiktok/*), reimplementada aqui
 * porque esses módulos não são 'use client' — evita puxar código server-only pro bundle do navegador.
 * `lagDays` fixo em 2, igual ao padrão do servidor (nunca inclui hoje). */
function presetWindow(spanDays: number, timeZone: string, lagDays = 2): AnalyticsWindow {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const base = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(base);
  end.setUTCDate(end.getUTCDate() - lagDays);
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() - lagDays - spanDays);
  return { startDateGe: iso(start), endDateLt: iso(end) };
}

/** Soma valores monetários AGRUPADOS por moeda — nunca soma moedas diferentes num só número (evitaria um total sem sentido). */
function sumMoneyByCurrency(values: (Money | null)[]): { currency: string; amount: number }[] {
  const byCurrency = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    const n = Number(v.amount);
    if (!Number.isFinite(n)) continue;
    byCurrency.set(v.currency, (byCurrency.get(v.currency) ?? 0) + n);
  }
  return [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount }));
}

function sumMoneyLabel(values: (Money | null)[]): string {
  const sums = sumMoneyByCurrency(values);
  if (sums.length === 0) return NA;
  return sums.map((s) => moneyByCurrency({ amount: String(s.amount), currency: s.currency })).join(' + ');
}

function sumNumbers(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

// --- Estados de conexão/permissão -------------------------------------------

function ConnectionState({ status }: { status: Exclude<ConnectionStatus, 'ready'> }) {
  if (status === 'not_connected') {
    return (
      <div className="empty-state">
        <Store />
        <h2>Sua loja ainda não está conectada</h2>
        <p>Autorize sua própria conta de vendedor TikTok Shop para ver vídeos e produtos aqui — isso não afeta o Radar (Bestsellers), que é público.</p>
        <a href="/api/tiktok/oauth/authorize?purpose=own_shop">Conectar loja</a>
      </div>
    );
  }
  if (status === 'token_expired') {
    return (
      <div className="empty-state is-error">
        <AlertTriangle />
        <h2>Sua sessão com a TikTok expirou</h2>
        <p>Reconecte para voltar a ver os dados da sua loja.</p>
        <a href="/api/tiktok/oauth/authorize?purpose=own_shop">Reconectar loja</a>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <ShieldAlert />
      <h2>Permissão ainda não confirmada</h2>
      <p>
        Sua loja está autorizada, mas a permissão de análise (&quot;TikTok Shop Analytics&quot;) ainda não foi concedida na última autorização. Reconecte e
        confirme essa permissão na tela de consentimento da TikTok.
      </p>
      <a href="/api/tiktok/oauth/authorize?purpose=own_shop">Reconectar e confirmar permissão</a>
    </div>
  );
}

function EndpointError({ result }: { result: Extract<EndpointResult<unknown>, { outcome: EndpointErrorOutcome }> }) {
  return (
    <div className="empty-state is-error">
      <AlertTriangle />
      <h2>{ENDPOINT_ERROR_LABEL[result.outcome]}</h2>
      <p>
        {result.message}
        {result.code !== undefined && ` (código ${result.code})`}
      </p>
    </div>
  );
}

// --- Seletor de período ------------------------------------------------------

function PeriodPicker({
  window,
  timeZone,
  latestAvailableDate,
  onApply,
}: {
  window: AnalyticsWindow;
  timeZone: string;
  latestAvailableDate: string | null;
  onApply: (w: AnalyticsWindow) => void;
}) {
  // Sem efeito pra sincronizar com `window`: o pai passa `key={...}` (ver
  // MyShopDashboard) que já remonta este componente — e reseta os useState
  // abaixo pro valor atual de `window` — sempre que o período aplicado muda.
  const [start, setStart] = useState(window.startDateGe);
  const [end, setEnd] = useState(window.endDateLt);

  return (
    <article className="panel" style={{ marginBottom: 16 }}>
      <div className="filterbar" style={{ flexWrap: 'wrap' }}>
        {PERIOD_PRESETS.map((p) => (
          <button key={p.spanDays} type="button" onClick={() => onApply(presetWindow(p.spanDays, timeZone))}>
            {p.label}
          </button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          De
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          até
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button type="button" onClick={() => onApply({ startDateGe: start, endDateLt: end })}>
          Aplicar período
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
        Fuso da loja: <strong>{timeZone}</strong> · Período consultado: <strong>{window.startDateGe}</strong> até <strong>{window.endDateLt}</strong> (data
        final exclusiva) · Data mais recente com dado pronto na TikTok:{' '}
        <strong>{latestAvailableDate ?? 'não informado pela API'}</strong>
      </p>
    </article>
  );
}

// --- KPIs --------------------------------------------------------------------

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span>{value}</span>
      <p>
        {label}
        {hint && <small style={{ display: 'block', fontSize: 10, color: 'var(--muted)' }}>{hint}</small>}
      </p>
    </div>
  );
}

// --- Vídeos --------------------------------------------------------------------

type VideoSortField = 'gmv' | 'views' | 'skuOrders' | 'itemsSold' | 'videoPostTime' | 'clickThroughRate';

function VideosPanel({ result }: { result: EndpointResult<VideoSummary> | undefined }) {
  const [q, setQ] = useState('');
  const [accountType, setAccountType] = useState('ALL');
  const [sort, setSort] = useState<VideoSortField>('gmv');
  const [sortDesc, setSortDesc] = useState(true);

  // Hooks precisam rodar sempre na mesma ordem — nunca depois de um return
  // condicional — então `items` cai pra [] quando ainda não há resultado de
  // sucesso, e o estado (loading/erro) só é decidido depois de calcular os memos.
  const items = useMemo(() => (isSuccessResult(result) ? result.items : []), [result]);

  const accountTypes = useMemo(() => {
    const set = new Set<string>();
    for (const v of items) if (v.creator?.authorType) set.add(v.creator.authorType);
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((v) => !needle || (v.title ?? '').toLowerCase().includes(needle) || (v.creator?.nickName ?? v.username ?? '').toLowerCase().includes(needle))
      .filter((v) => accountType === 'ALL' || v.creator?.authorType === accountType)
      .slice()
      .sort((a, b) => {
        const dir = sortDesc ? -1 : 1;
        if (sort === 'gmv') return dir * ((Number(a.gmv?.amount) || 0) - (Number(b.gmv?.amount) || 0));
        if (sort === 'views') return dir * ((a.views ?? -Infinity) - (b.views ?? -Infinity));
        if (sort === 'skuOrders') return dir * ((a.skuOrders ?? -Infinity) - (b.skuOrders ?? -Infinity));
        if (sort === 'itemsSold') return dir * ((a.itemsSold ?? -Infinity) - (b.itemsSold ?? -Infinity));
        if (sort === 'clickThroughRate') return dir * ((Number(a.clickThroughRate) || -Infinity) - (Number(b.clickThroughRate) || -Infinity));
        return dir * (a.videoPostTime ?? '').localeCompare(b.videoPostTime ?? '');
      });
  }, [items, q, accountType, sort, sortDesc]);

  if (!result) return <LoadingState label="Carregando vídeos…" />;
  if (!isSuccessResult(result)) return <EndpointError result={result} />;

  function toggleSort(field: VideoSortField) {
    if (sort === field) setSortDesc((d) => !d);
    else {
      setSort(field);
      setSortDesc(true);
    }
  }

  const gmvSums = sumMoneyByCurrency(items.map((v) => v.gmv));

  return (
    <>
      {/* Sem nenhum vídeo na amostra, "Não informado" nos 4 cartões seria redundante/confuso logo acima
          do estado vazio abaixo — a mensagem "Nenhum vídeo encontrado" já comunica isso sozinha. */}
      {items.length > 0 && (
        <div className="radar-summary" style={{ marginBottom: 14 }}>
          <KpiCard label="Vídeos nesta amostra" value={compact(items.length)} hint={result.totalCount !== null ? `${result.totalCount} no total, segundo a TikTok` : undefined} />
          <KpiCard label="GMV somado" value={sumMoneyLabel(items.map((v) => v.gmv))} hint={result.truncatedByPageLimit ? 'só dos vídeos desta amostra — havia mais páginas' : 'todos os vídeos do período'} />
          <KpiCard label="Views somadas" value={compact(sumNumbers(items.map((v) => v.views)))} />
          <KpiCard label="Itens vendidos" value={compact(sumNumbers(items.map((v) => v.itemsSold)))} />
        </div>
      )}
      {gmvSums.length > 1 && (
        <p className="auth-message" role="status" style={{ fontSize: 12 }}>
          Atenção: os vídeos desta amostra vieram em mais de uma moeda ({gmvSums.map((s) => s.currency).join(', ')}) — o GMV somado acima é mostrado por
          moeda, nunca somado junto.
        </p>
      )}

      <div className="filterbar" style={{ marginBottom: 10 }}>
        <label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título ou criador..." />
        </label>
        <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
          <option value="ALL">Todos os tipos de conta</option>
          {accountTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Store />
          <h2>Nenhum vídeo encontrado</h2>
          <p>Ajuste a busca/filtro, ou não há vídeos com atividade neste período.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>VÍDEO</th>
                <th>CRIADOR</th>
                <th>TIPO DE CONTA</th>
                <SortableTh label="DATA" active={sort === 'videoPostTime'} desc={sortDesc} onClick={() => toggleSort('videoPostTime')} />
                <SortableTh label="VIEWS" active={sort === 'views'} desc={sortDesc} onClick={() => toggleSort('views')} />
                <SortableTh label="GMV" active={sort === 'gmv'} desc={sortDesc} onClick={() => toggleSort('gmv')} />
                <SortableTh label="PEDIDOS (SKU)" active={sort === 'skuOrders'} desc={sortDesc} onClick={() => toggleSort('skuOrders')} />
                <SortableTh label="ITENS VENDIDOS" active={sort === 'itemsSold'} desc={sortDesc} onClick={() => toggleSort('itemsSold')} />
                <SortableTh label="CTR" active={sort === 'clickThroughRate'} desc={sortDesc} onClick={() => toggleSort('clickThroughRate')} />
                <th>PRODUTOS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.id ?? i}>
                  <td>
                    <strong>{text(v.title)}</strong>
                    {v.durationSeconds !== null && <small>{v.durationSeconds}s</small>}
                  </td>
                  <td>{text(v.creator?.nickName ?? v.creator?.userName ?? v.username)}</td>
                  <td>{v.creator?.authorType ?? NA}</td>
                  <td>{v.videoPostTime ? fullDate(v.videoPostTime.replace(' ', 'T') + 'Z') : NA}</td>
                  <td>{compact(v.views)}</td>
                  <td>{moneyByCurrency(v.gmv)}</td>
                  <td>{compact(v.skuOrders)}</td>
                  <td>{compact(v.itemsSold)}</td>
                  <td>{v.clickThroughRate ?? NA}</td>
                  <td>{compact(v.productCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SortableTh({ label, active, desc, onClick }: { label: string; active: boolean; desc: boolean; onClick: () => void }) {
  return (
    <th>
      <button type="button" onClick={onClick} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active && (desc ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
      </button>
    </th>
  );
}

// --- Produtos ------------------------------------------------------------------

type ProductSortField = 'gmv' | 'orders' | 'itemsSold' | 'productImpressions' | 'ctr';

function ProductRow({ p }: { p: ProductSummary }) {
  const [open, setOpen] = useState(false);
  const tp = p.totalPerformance;
  const hasChannelDetail = p.channels.length > 0 || p.shopTab !== null;
  return (
    <>
      <tr>
        <td>
          {hasChannelDetail && (
            <button type="button" onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', marginRight: 6 }} aria-label="Ver canais">
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <span title="A API de produto não retorna nome/título — só o ID.">{text(p.id)}</span>
        </td>
        <td>{moneyByCurrency(tp?.gmv)}</td>
        <td>{compact(tp?.orders ?? null)}</td>
        <td>{compact(tp?.itemsSold ?? null)}</td>
        <td>{compact(tp?.productImpressions ?? null)}</td>
        <td>{compact(tp?.productClicks ?? null)}</td>
        <td>{tp?.ctr ?? NA}</td>
        <td>{tp?.addCartRate ?? NA}</td>
        <td>{moneyByCurrency(tp?.refunds ?? null)}</td>
        <td>
          {p.channelsWithData.length === 0
            ? '—'
            : p.channelsWithData.map((c) => (
                <span key={c} className="sat" style={{ marginRight: 4 }}>
                  {CHANNEL_LABEL[c] ?? c}
                </span>
              ))}
        </td>
      </tr>
      {open && hasChannelDetail && (
        <tr>
          <td colSpan={10} style={{ background: 'var(--surface)' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>CANAL</th>
                    <th>GMV ATRIBUÍDO</th>
                    <th>PEDIDOS ATRIBUÍDOS</th>
                    <th>IMPRESSÕES</th>
                    <th>CLIQUES</th>
                    <th>CTR</th>
                    <th>ADD-TO-CART</th>
                  </tr>
                </thead>
                <tbody>
                  {p.channels.map((c) => (
                    <tr key={c.channel}>
                      <td>{CHANNEL_LABEL[c.channel] ?? c.channel}</td>
                      <td>{moneyByCurrency(c.attributedGmv)}</td>
                      <td>{c.attributedOrders === null ? 'não documentado p/ este canal' : compact(c.attributedOrders)}</td>
                      <td>{compact(c.productImpressions)}</td>
                      <td>{compact(c.productClicks)}</td>
                      <td>{c.ctr ?? NA}</td>
                      <td>{c.addCartRate ?? NA}</td>
                    </tr>
                  ))}
                  {p.shopTab && (
                    <tr>
                      <td>{CHANNEL_LABEL.shop_tab_performance}</td>
                      <td>{moneyByCurrency(p.shopTab.gmv)}</td>
                      <td>não documentado p/ este canal</td>
                      <td>{compact(p.shopTab.productImpressions)}</td>
                      <td>{compact(p.shopTab.productClicks)}</td>
                      <td>{p.shopTab.ctr ?? NA}</td>
                      <td>—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ProductsPanel({ result }: { result: EndpointResult<ProductSummary> | undefined }) {
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [sort, setSort] = useState<ProductSortField>('gmv');
  const [sortDesc, setSortDesc] = useState(true);

  // Hooks precisam rodar sempre na mesma ordem — nunca depois de um return
  // condicional — então `items` cai pra [] quando ainda não há resultado de
  // sucesso, e o estado (loading/erro) só é decidido depois de calcular o memo.
  const items = useMemo(() => (isSuccessResult(result) ? result.items : []), [result]);

  const filtered = useMemo(
    () =>
      items
        .filter((p) => channelFilter === 'ALL' || p.channelsWithData.includes(channelFilter))
        .slice()
        .sort((a, b) => {
          const dir = sortDesc ? -1 : 1;
          const tpa = a.totalPerformance;
          const tpb = b.totalPerformance;
          if (sort === 'gmv') return dir * ((Number(tpa?.gmv?.amount) || 0) - (Number(tpb?.gmv?.amount) || 0));
          if (sort === 'orders') return dir * ((tpa?.orders ?? -Infinity) - (tpb?.orders ?? -Infinity));
          if (sort === 'itemsSold') return dir * ((tpa?.itemsSold ?? -Infinity) - (tpb?.itemsSold ?? -Infinity));
          if (sort === 'productImpressions') return dir * ((tpa?.productImpressions ?? -Infinity) - (tpb?.productImpressions ?? -Infinity));
          return dir * ((Number(tpa?.ctr) || -Infinity) - (Number(tpb?.ctr) || -Infinity));
        }),
    [items, channelFilter, sort, sortDesc],
  );

  if (!result) return <LoadingState label="Carregando produtos…" />;
  if (!isSuccessResult(result)) return <EndpointError result={result} />;

  function toggleSort(field: ProductSortField) {
    if (sort === field) setSortDesc((d) => !d);
    else {
      setSort(field);
      setSortDesc(true);
    }
  }

  return (
    <>
      {/* Mesmo raciocínio de VideosPanel: sem produto na amostra, os cartões só repetiriam
          "Não informado" logo acima do estado vazio abaixo. */}
      {items.length > 0 && (
        <div className="radar-summary" style={{ marginBottom: 14 }}>
          <KpiCard label="Produtos nesta amostra" value={compact(items.length)} hint={result.totalCount !== null ? `${result.totalCount} no total, segundo a TikTok` : undefined} />
          <KpiCard
            label="GMV somado"
            value={sumMoneyLabel(items.map((p) => p.totalPerformance?.gmv ?? null))}
            hint={result.truncatedByPageLimit ? 'só dos produtos desta amostra — havia mais páginas' : 'todos os produtos do período'}
          />
          <KpiCard label="Pedidos" value={compact(sumNumbers(items.map((p) => p.totalPerformance?.orders ?? null)))} />
          <KpiCard label="Itens vendidos" value={compact(sumNumbers(items.map((p) => p.totalPerformance?.itemsSold ?? null)))} />
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
        GMV é faturamento bruto, não lucro — reembolsos aparecem numa coluna própria, nunca subtraídos silenciosamente.
      </p>

      <div className="filterbar" style={{ marginBottom: 10 }}>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
          <option value="ALL">Todos os canais</option>
          {Object.entries(CHANNEL_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Store />
          <h2>Nenhum produto encontrado</h2>
          <p>Ajuste o filtro de canal, ou não há produtos com atividade neste período.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID DO PRODUTO</th>
                <SortableTh label="GMV" active={sort === 'gmv'} desc={sortDesc} onClick={() => toggleSort('gmv')} />
                <SortableTh label="PEDIDOS" active={sort === 'orders'} desc={sortDesc} onClick={() => toggleSort('orders')} />
                <SortableTh label="ITENS VENDIDOS" active={sort === 'itemsSold'} desc={sortDesc} onClick={() => toggleSort('itemsSold')} />
                <SortableTh label="IMPRESSÕES" active={sort === 'productImpressions'} desc={sortDesc} onClick={() => toggleSort('productImpressions')} />
                <th>CLIQUES</th>
                <SortableTh label="CTR" active={sort === 'ctr'} desc={sortDesc} onClick={() => toggleSort('ctr')} />
                <th>ADD-TO-CART</th>
                <th>REEMBOLSOS</th>
                <th>CANAIS COM DADO</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <ProductRow key={p.id ?? i} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="nir-note">
        A API de performance de produto não retorna nome, imagem, preço, comissão ou URL do produto — só o ID e as métricas. Nunca inventamos esses campos
        aqui; para ver o catálogo completo, use a página de Produtos.
      </p>
    </>
  );
}

// --- Componente principal ------------------------------------------------------

export function MyShopDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [requestedWindow, setRequestedWindow] = useState<AnalyticsWindow | null>(null);

  async function load(window?: AnalyticsWindow) {
    setLoading(true);
    setFetchError(null);
    try {
      const qs = window ? `?start_date_ge=${window.startDateGe}&end_date_lt=${window.endDateLt}` : '';
      const res = await fetch(`/api/tiktok/own-shop/dashboard${qs}`, { headers: { accept: 'application/json' } });
      const json = (await res.json().catch(() => ({}))) as DashboardResponse;
      if (!res.ok && !json.periodError) {
        setFetchError(json.error || 'Falha ao carregar os dados da sua loja.');
        return;
      }
      setData(json);
    } catch {
      setFetchError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial ao montar, mesmo padrão já usado em components/app-shell.tsx (ThemeToggle)
    load();
  }, []);

  if (loading && !data) return <LoadingState label="Carregando dados da sua loja…" />;
  if (fetchError) {
    return (
      <div className="empty-state is-error">
        <AlertTriangle />
        <h2>Não foi possível carregar</h2>
        <p>{fetchError}</p>
        <button type="button" onClick={() => load(requestedWindow ?? undefined)}>
          <RefreshCw size={14} /> Tentar de novo
        </button>
      </div>
    );
  }
  if (!data) return null;

  if (data.connection.status !== 'ready') return <ConnectionState status={data.connection.status} />;

  const timeZone = data.connection.timeZone ?? 'UTC';

  if (data.periodError) {
    return (
      <>
        {data.queriedWindow && (
          <PeriodPicker
            key={`${(requestedWindow ?? data.queriedWindow).startDateGe}_${(requestedWindow ?? data.queriedWindow).endDateLt}`}
            window={requestedWindow ?? data.queriedWindow}
            timeZone={timeZone}
            latestAvailableDate={null}
            onApply={(w) => {
              setRequestedWindow(w);
              load(w);
            }}
          />
        )}
        <p className="auth-message is-error" role="alert">
          {PERIOD_ERROR_LABEL[data.periodError]}
        </p>
      </>
    );
  }

  const window = data.queriedWindow ?? { startDateGe: '', endDateLt: '' };
  const latestAvailableDate =
    (isSuccessResult(data.video) && data.video.latestAvailableDate) || (isSuccessResult(data.product) && data.product.latestAvailableDate) || null;

  return (
    <>
      <p className="nir-note" style={{ marginBottom: 16 }}>
        <Lock size={13} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
        <strong>Minha loja</strong> mostra dados <strong>privados</strong> da loja que você autorizou (
        {data.connection.sellerName ?? 'loja conectada'}). É diferente do <strong>Radar</strong>, que mostra o ranking <strong>público</strong> de
        Bestsellers de outras lojas.
      </p>

      <PeriodPicker
        key={`${(requestedWindow ?? window).startDateGe}_${(requestedWindow ?? window).endDateLt}`}
        window={requestedWindow ?? window}
        timeZone={timeZone}
        latestAvailableDate={latestAvailableDate}
        onApply={(w) => {
          setRequestedWindow(w);
          load(w);
        }}
      />

      {loading && <LoadingState label="Atualizando…" />}

      {!loading && (
        <>
          <h2 style={{ margin: '20px 0 10px' }}>Vídeos</h2>
          <article className="panel table-panel">
            <VideosPanel result={data.video} />
          </article>

          <h2 style={{ margin: '24px 0 10px' }}>Produtos</h2>
          <article className="panel table-panel">
            <ProductsPanel result={data.product} />
          </article>
        </>
      )}
    </>
  );
}
