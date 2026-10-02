'use client';

// Painel "Minha conta de afiliado" — consome só /api/tiktok/affiliate/dashboard,
// que usa EXCLUSIVAMENTE a conexão affiliate_creator do usuário autenticado.
// Tipos abaixo duplicam (não importam) os tipos do servidor — mesmo padrão
// de components/my-shop-dashboard.tsx.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, Store, Video as VideoIcon } from 'lucide-react';
import { compact, NA, text } from '@/lib/format';
import { LoadingState } from '@/components/state-message';

type ConnectionStatus = 'not_connected' | 'token_expired' | 'permission_pending' | 'ready';
type CallFailure = 'insufficient_permission' | 'token_expired' | 'token_invalid' | 'wrong_token_identity' | 'unexpected_format' | 'api_error';

interface Money {
  amount: string;
  currency: string;
}
interface CreatorProfile {
  username: string | null;
  avatarUrl: string | null;
  selectionRegion: string | null;
  registerRegion: string | null;
  sellerType: string | null;
  userType: string | null;
  permissions: string[] | null;
  creatorUserOpenId: string | null;
}
interface OrderSkuSummary {
  id: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  contentType: string | null;
  contentId: string | null;
  commissionRate: number | null;
  estimatedCommission: Money | null;
  actualCommission: Money | null;
  returnedQuantity: number | null;
  refundedQuantity: number | null;
}
interface AffiliateOrderSummary {
  id: string | null;
  createTime: number | null;
  status: string | null;
  skus: OrderSkuSummary[];
}
interface ShowcaseProduct {
  id: string | null;
  title: string | null;
  shopName: string | null;
  mainImageUrl: string | null;
  inventoryStatus: string | null;
  reviewStatus: string | null;
  isHidden: boolean | null;
  source: string | null;
  detailLink: string | null;
  commissionRate: number | null;
  commissionRewardRate: number | null;
}
interface VideoSalesAggregate {
  contentId: string;
  orderCount: number;
  unitsSold: number;
  estimatedCommission: { currency: string; amount: number }[];
  actualCommission: { currency: string; amount: number }[];
}

type CallResult<T> =
  | ({ outcome: CallFailure } & { code?: number; status?: number; message: string })
  | { outcome: 'success_with_data' | 'success_empty'; itemCount: number; totalCount: number | null; pagesFetched: number; truncatedByPageLimit: boolean; items: T[] };

interface AffiliateDashboardResponse {
  error?: string;
  connection: { status: ConnectionStatus; openId?: string; scopes?: Record<string, boolean> };
  profile?: CreatorProfile | null;
  profileError?: { kind: string; message: string } | null;
  queriedWindow?: { createTimeGe: number; createTimeLt: number };
  periodError?: string;
  orders?: CallResult<AffiliateOrderSummary>;
  videoSales?: VideoSalesAggregate[];
  nonVideoOrderCount?: number;
  showcaseProducts?: CallResult<ShowcaseProduct>;
  collaborations?: CallResult<unknown> | { outcome: 'shop_id_required' };
}

function isSuccess<T>(r: CallResult<T> | undefined): r is Extract<CallResult<T>, { outcome: 'success_with_data' | 'success_empty' }> {
  return r?.outcome === 'success_with_data' || r?.outcome === 'success_empty';
}

const CALL_ERROR_LABEL: Record<CallFailure, string> = {
  insufficient_permission: 'Permissão insuficiente',
  token_expired: 'Token expirado — reconecte',
  token_invalid: 'Token inválido — reconecte',
  wrong_token_identity: 'Token do tipo errado',
  unexpected_format: 'A TikTok respondeu em formato inesperado',
  api_error: 'Erro da API',
};

const PERIOD_PRESETS = [
  { spanDays: 7, label: '7 dias' },
  { spanDays: 14, label: '14 dias' },
  { spanDays: 30, label: '30 dias' },
  { spanDays: 90, label: '90 dias' },
] as const;

function moneySum(values: { currency: string; amount: number }[]): string {
  if (values.length === 0) return NA;
  return values
    .map((v) => {
      try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: v.currency }).format(v.amount);
      } catch {
        return `${v.amount} ${v.currency}`;
      }
    })
    .join(' + ');
}

function money(value: Money | null): string {
  if (!value) return NA;
  const n = Number(value.amount);
  if (!Number.isFinite(n)) return NA;
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: value.currency }).format(n);
  } catch {
    return `${value.amount} ${value.currency}`;
  }
}

function ConnectionState({ status }: { status: Exclude<ConnectionStatus, 'ready'> }) {
  if (status === 'not_connected') {
    return (
      <div className="empty-state">
        <Store />
        <h2>Sua conta de afiliado ainda não está conectada</h2>
        <p>Autorize sua própria conta de criador afiliado TikTok Shop para ver pedidos, vitrine e vendas por vídeo aqui.</p>
        <a href="/api/tiktok/creator/oauth/authorize">Conectar conta de afiliado</a>
      </div>
    );
  }
  if (status === 'token_expired') {
    return (
      <div className="empty-state is-error">
        <AlertTriangle />
        <h2>Sua sessão com a TikTok expirou</h2>
        <p>Reconecte para voltar a ver os dados da sua conta de afiliado.</p>
        <a href="/api/tiktok/creator/oauth/authorize">Reconectar</a>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <ShieldAlert />
      <h2>Permissão ainda não confirmada</h2>
      <p>Sua conta está autorizada, mas nem todos os 3 escopos esperados foram concedidos na última autorização. Reconecte e confirme todos na tela da TikTok.</p>
      <a href="/api/tiktok/creator/oauth/authorize">Reconectar e confirmar permissões</a>
    </div>
  );
}

export function AffiliateDashboard() {
  const [data, setData] = useState<AffiliateDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [spanDays, setSpanDays] = useState(7);
  const [shopId, setShopId] = useState('');

  async function load(span: number, shop?: string) {
    setLoading(true);
    setFetchError(null);
    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const ge = nowSeconds - span * 86400;
      const qs = new URLSearchParams({ create_time_ge: String(ge), create_time_lt: String(nowSeconds) });
      if (shop) qs.set('shop_id', shop);
      const res = await fetch(`/api/tiktok/affiliate/dashboard?${qs.toString()}`, { headers: { accept: 'application/json' } });
      const json = (await res.json().catch(() => ({}))) as AffiliateDashboardResponse;
      if (!res.ok && !json.periodError) {
        setFetchError(json.error || 'Falha ao carregar os dados da sua conta de afiliado.');
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
    load(7);
  }, []);

  const orders = isSuccess(data?.orders) ? data!.orders.items : [];
  const videoSales = useMemo(() => [...(data?.videoSales ?? [])].sort((a, b) => sumNum(b.actualCommission) - sumNum(a.actualCommission)), [data?.videoSales]);

  function sumNum(v: { amount: number }[]): number {
    return v.reduce((s, x) => s + x.amount, 0);
  }

  if (loading && !data) return <LoadingState label="Carregando dados da sua conta de afiliado…" />;
  if (fetchError) {
    return (
      <div className="empty-state is-error">
        <AlertTriangle />
        <h2>Não foi possível carregar</h2>
        <p>{fetchError}</p>
        <button type="button" onClick={() => load(spanDays, shopId || undefined)}>
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!data) return null;
  if (data.connection.status !== 'ready') return <ConnectionState status={data.connection.status} />;

  return (
    <>
      <p className="nir-note" style={{ marginBottom: 16 }}>
        <strong>Minha conta de afiliado</strong> mostra dados <strong>privados</strong> da sua conta de criador — pedidos, vitrine e vendas por vídeo. Nunca
        o ranking público do Radar, nem dados da sua loja seller (se houver).
      </p>

      {data.profile && (
        <article className="panel" style={{ marginBottom: 16 }}>
          <div className="config-row">
            <span>Criador</span>
            <strong>{text(data.profile.username)}</strong>
          </div>
          <div className="config-row">
            <span>Região de venda / registro</span>
            <strong>
              {text(data.profile.selectionRegion)} / {text(data.profile.registerRegion)}
            </strong>
          </div>
        </article>
      )}
      {data.profileError && (
        <p className="auth-message is-error" role="alert">
          Perfil: {CALL_ERROR_LABEL[data.profileError.kind as CallFailure] ?? data.profileError.kind} — {data.profileError.message}
        </p>
      )}

      <article className="panel" style={{ marginBottom: 16 }}>
        <div className="filterbar">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.spanDays}
              type="button"
              onClick={() => {
                setSpanDays(p.spanDays);
                load(p.spanDays, shopId || undefined);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {data.queriedWindow && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
            Período consultado: {new Date(data.queriedWindow.createTimeGe * 1000).toLocaleDateString('pt-BR')} até{' '}
            {new Date(data.queriedWindow.createTimeLt * 1000).toLocaleDateString('pt-BR')}
          </p>
        )}
        {data.periodError && (
          <p className="auth-message is-error" role="alert">
            Período inválido: {data.periodError}
          </p>
        )}
      </article>

      <h2 style={{ margin: '20px 0 10px' }}>Pedidos de afiliado</h2>
      <article className="panel table-panel" style={{ marginBottom: 20 }}>
        {!isSuccess(data.orders) && data.orders && (
          <p className="auth-message is-error" role="alert">
            {CALL_ERROR_LABEL[data.orders.outcome as CallFailure] ?? data.orders.outcome}: {'message' in data.orders ? data.orders.message : ''}
          </p>
        )}
        {isSuccess(data.orders) && orders.length === 0 && (
          <div className="empty-state">
            <Store />
            <h2>Sem pedidos no período</h2>
            <p>Nenhum pedido de afiliado encontrado nesta janela.</p>
          </div>
        )}
        {isSuccess(data.orders) && orders.length > 0 && (
          <>
            <div className="radar-summary" style={{ marginBottom: 14 }}>
              <div>
                <span>{compact(orders.length)}</span>
                <p>Pedidos nesta amostra{data.orders.totalCount !== null ? ` (${data.orders.totalCount} no total)` : ''}</p>
              </div>
              <div>
                <span>{compact(data.nonVideoOrderCount ?? null)}</span>
                <p>Sem atribuição por vídeo (shop/live/outro)</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PEDIDO</th>
                    <th>STATUS</th>
                    <th>PRODUTO</th>
                    <th>QTD</th>
                    <th>ORIGEM</th>
                    <th>COMISSÃO ESTIMADA</th>
                    <th>COMISSÃO REAL</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 50).flatMap((o) =>
                    o.skus.map((sku, i) => (
                      <tr key={`${o.id}-${i}`}>
                        <td>{text(o.id)}</td>
                        <td>{text(o.status)}</td>
                        <td>{text(sku.productName)}</td>
                        <td>{compact(sku.quantity)}</td>
                        <td>
                          {sku.contentType ?? NA}
                          {sku.contentType === 'VIDEO' && sku.contentId ? ` (${sku.contentId.slice(-8)})` : ''}
                        </td>
                        <td>{money(sku.estimatedCommission)}</td>
                        <td>{money(sku.actualCommission)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            {orders.length > 50 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Mostrando os 50 primeiros pedidos desta amostra.</p>}
          </>
        )}
      </article>

      <h2 style={{ margin: '20px 0 10px' }}>Vídeos que mais venderam</h2>
      <article className="panel table-panel" style={{ marginBottom: 20 }}>
        <p className="nir-note" style={{ marginBottom: 14 }}>
          <VideoIcon size={13} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />A TikTok confirma oficialmente a atribuição de venda por vídeo
          (<code>content_id</code> em cada pedido quando a origem é <code>VIDEO</code>) — mas <strong>não existe, nos escopos atuais, nenhuma API</strong> que
          resolva esse ID em título, miniatura, data de publicação, views, cliques ou CTR. O ranking abaixo é por ID técnico, com GMV/comissão/pedidos/
          unidades reais — nunca com metadado inventado (ver docs/tiktok-affiliate-creator-fields.md).
        </p>
        {isSuccess(data.orders) && videoSales.length === 0 && (
          <div className="empty-state">
            <VideoIcon />
            <h2>Nenhuma venda com atribuição de vídeo neste período</h2>
            <p>Os pedidos deste período vieram de outras origens (shop, live, link, etc.) — ver coluna &quot;Origem&quot; na tabela de pedidos acima.</p>
          </div>
        )}
        {videoSales.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID DO VÍDEO (content_id)</th>
                  <th>PEDIDOS</th>
                  <th>UNIDADES</th>
                  <th>COMISSÃO ESTIMADA</th>
                  <th>COMISSÃO REAL</th>
                </tr>
              </thead>
              <tbody>
                {videoSales.map((v) => (
                  <tr key={v.contentId}>
                    <td title={v.contentId}>{v.contentId}</td>
                    <td>{compact(v.orderCount)}</td>
                    <td>{compact(v.unitsSold)}</td>
                    <td>{moneySum(v.estimatedCommission)}</td>
                    <td>{moneySum(v.actualCommission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <h2 style={{ margin: '20px 0 10px' }}>Produtos da vitrine</h2>
      <article className="panel table-panel" style={{ marginBottom: 20 }}>
        {!isSuccess(data.showcaseProducts) && data.showcaseProducts && (
          <p className="auth-message is-error" role="alert">
            {CALL_ERROR_LABEL[data.showcaseProducts.outcome as CallFailure] ?? data.showcaseProducts.outcome}
          </p>
        )}
        {isSuccess(data.showcaseProducts) && data.showcaseProducts.items.length === 0 && (
          <div className="empty-state">
            <Store />
            <h2>Nenhum produto na vitrine</h2>
          </div>
        )}
        {isSuccess(data.showcaseProducts) && data.showcaseProducts.items.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PRODUTO</th>
                  <th>LOJA</th>
                  <th>STATUS</th>
                  <th>TAXA DE COMISSÃO</th>
                </tr>
              </thead>
              <tbody>
                {data.showcaseProducts.items.map((p, i) => (
                  <tr key={p.id ?? i}>
                    <td>{text(p.title)}</td>
                    <td>{text(p.shopName)}</td>
                    <td>
                      {text(p.inventoryStatus)} / {text(p.reviewStatus)}
                    </td>
                    <td>{p.commissionRate !== null ? `${(p.commissionRate / 100).toFixed(2)}%` : NA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <h2 style={{ margin: '20px 0 10px' }}>Colaborações</h2>
      <article className="panel" style={{ marginBottom: 20 }}>
        {(!data.collaborations || data.collaborations.outcome === 'shop_id_required') && (
          <>
            <p className="nir-note">
              A API oficial de colaborações exige o ID da loja (<code>shop_id</code>) — não há, nos escopos atuais, nenhuma API que liste automaticamente as
              lojas com que você colabora para descobrir esse ID. Se você souber o <code>shop_id</code>, informe abaixo para consultar.
            </p>
            <div className="filterbar" style={{ marginTop: 10 }}>
              <label>
                <input value={shopId} onChange={(e) => setShopId(e.target.value)} placeholder="shop_id" />
              </label>
              <button type="button" onClick={() => load(spanDays, shopId || undefined)} disabled={!shopId.trim()}>
                Consultar colaborações
              </button>
            </div>
          </>
        )}
        {data.collaborations && data.collaborations.outcome !== 'shop_id_required' && !isSuccess(data.collaborations) && (
          <p className="auth-message is-error" role="alert">
            {CALL_ERROR_LABEL[data.collaborations.outcome as CallFailure] ?? data.collaborations.outcome}
          </p>
        )}
        {data.collaborations && data.collaborations.outcome !== 'shop_id_required' && isSuccess(data.collaborations) && (
          <p>{data.collaborations.itemCount} colaborações encontradas para esta loja.</p>
        )}
      </article>
    </>
  );
}
