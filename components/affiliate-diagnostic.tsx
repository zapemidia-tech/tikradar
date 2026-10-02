'use client';

import { useState } from 'react';

// Tipos duplicados do contrato de app/api/admin/tiktok/affiliate-diagnostic
// (mesmo padrão de components/shop-analytics-diagnostic.tsx): o componente
// cliente nunca importa módulos server-only.

type ConnectionState = 'not_connected' | 'token_expired';
type CallFailure = 'insufficient_permission' | 'token_expired' | 'token_invalid' | 'wrong_token_identity' | 'unexpected_format' | 'api_error' | 'skipped_missing_shop_id';

type CallResult =
  | ({ outcome: CallFailure } & { code?: number; status?: number; message: string })
  | { outcome: 'success_with_data' | 'success_empty'; itemCount: number; totalCount: number | null; pagesFetched: number; truncatedByPageLimit: boolean; observedFields: string[]; sample: unknown[] };

interface CallMeta {
  apiName: string;
  path: string;
  version: string;
  requiredScopes: string[];
}

interface DiagnosticResponse {
  error?: string;
  connection: { status: ConnectionState | 'ready'; openId?: string; allScopesGranted?: boolean; scopes?: Record<string, boolean>; expectedScopes?: string[] };
  queriedPeriod?: { createTimeGe: number; createTimeLt: number };
  calls?: Record<'profile' | 'showcaseProducts' | 'affiliateOrders' | 'targetCollaborations', { meta: CallMeta; result: CallResult }>;
}

const OUTCOME_LABEL: Record<string, string> = {
  not_connected: 'Conta de afiliado não conectada',
  token_expired: 'Token expirado — reconecte',
  insufficient_permission: 'Permissão insuficiente',
  token_invalid: 'Token inválido/revogado',
  wrong_token_identity: 'Token do tipo errado (ex.: token de seller)',
  unexpected_format: 'Formato inesperado',
  api_error: 'Erro da API',
  skipped_missing_shop_id: 'Pulado — falta shop_id',
  success_with_data: 'Sucesso — com dados',
  success_empty: 'Sucesso — sem dados',
};

function isSuccess(r: CallResult): r is Extract<CallResult, { outcome: 'success_with_data' | 'success_empty' }> {
  return r.outcome === 'success_with_data' || r.outcome === 'success_empty';
}

function CallCard({ title, data }: { title: string; data?: { meta: CallMeta; result: CallResult } }) {
  if (!data) return null;
  const { meta, result } = data;
  return (
    <article className="panel" style={{ marginBottom: 14 }}>
      <div className="config-row">
        <span>
          <strong>{title}</strong>
        </span>
        <strong className={isSuccess(result) ? 'ok' : ''}>{OUTCOME_LABEL[result.outcome] ?? result.outcome}</strong>
      </div>
      <div className="config-row">
        <span>Path / versão</span>
        <strong>
          {meta.path} ({meta.version})
        </strong>
      </div>
      <div className="config-row">
        <span>Scopes necessários</span>
        <strong>{meta.requiredScopes.join(', ')}</strong>
      </div>
      {!isSuccess(result) && (
        <p className="auth-message is-error" role="alert">
          {result.message}
          {'code' in result && result.code !== undefined && ` (código ${result.code})`}
        </p>
      )}
      {isSuccess(result) && (
        <>
          <div className="config-row">
            <span>Registros nesta amostra</span>
            <strong>
              {result.itemCount}
              {result.totalCount !== null ? ` (total_count da API: ${result.totalCount})` : ''}
            </strong>
          </div>
          <div className="config-row">
            <span>Páginas percorridas</span>
            <strong>
              {result.pagesFetched}
              {result.truncatedByPageLimit ? ' (havia mais — parado no limite de segurança)' : ''}
            </strong>
          </div>
          <div className="config-row">
            <span>Campos recebidos (1º registro)</span>
            <strong>{result.observedFields.length ? result.observedFields.join(', ') : '—'}</strong>
          </div>
          {result.sample.length > 0 && (
            <>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 6px' }}>Amostra (só os campos já tipados — nunca o payload bruto):</p>
              <pre style={{ fontSize: 11, overflowX: 'auto', background: 'var(--surface)', padding: 10, borderRadius: 'var(--radius-sm)' }}>{JSON.stringify(result.sample, null, 2)}</pre>
            </>
          )}
        </>
      )}
    </article>
  );
}

export function AffiliateDiagnostic() {
  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState('');
  const [result, setResult] = useState<DiagnosticResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/tiktok/affiliate-diagnostic', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ shop_id: shopId.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as DiagnosticResponse;
      if (!res.ok) {
        setError(data.error || 'Falha ao rodar o diagnóstico.');
        return;
      }
      setResult(data);
    } catch {
      setError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="filterbar" style={{ marginBottom: 14 }}>
        <label>
          <input value={shopId} onChange={(e) => setShopId(e.target.value)} placeholder="shop_id (opcional — só pra testar Target Collaborations)" />
        </label>
        <button type="button" onClick={run} disabled={loading}>
          {loading ? (
            <>
              <span className="auth-spinner" aria-hidden="true" />
              Rodando diagnóstico…
            </>
          ) : (
            'Rodar diagnóstico agora'
          )}
        </button>
      </div>
      {error && (
        <p className="auth-message is-error" role="alert">
          {error}
        </p>
      )}

      {result && result.connection.status !== 'ready' && (
        <p className="auth-message is-error" role="alert">
          {OUTCOME_LABEL[result.connection.status]}
        </p>
      )}

      {result && result.connection.status === 'ready' && (
        <>
          <article className="panel" style={{ marginBottom: 14 }}>
            <div className="config-row">
              <span>Open ID (criador)</span>
              <strong>{result.connection.openId ? `••••${result.connection.openId.slice(-6)}` : '—'}</strong>
            </div>
            <div className="config-row">
              <span>Scopes esperados</span>
              <strong className={result.connection.allScopesGranted ? 'ok' : ''}>
                {result.connection.expectedScopes
                  ?.map((s) => `${s}: ${result.connection.scopes?.[s] ? 'concedido' : 'faltando'}`)
                  .join(' · ')}
              </strong>
            </div>
          </article>

          <CallCard title="Get Creator Profile" data={result.calls?.profile} />
          <CallCard title="Get Showcase Products" data={result.calls?.showcaseProducts} />
          <CallCard title="Search Creator Affiliate Orders (últimos 30 dias)" data={result.calls?.affiliateOrders} />
          <CallCard title="Search Creator Target Collaborations" data={result.calls?.targetCollaborations} />
        </>
      )}
    </div>
  );
}
