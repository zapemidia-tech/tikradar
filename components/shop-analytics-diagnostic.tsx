'use client';

import { useState } from 'react';

type ConnectionState = 'not_connected' | 'token_expired';
type ApiFailure = 'insufficient_permission' | 'invalid_period' | 'api_error';

interface SuccessDiagnostic {
  outcome: 'success_with_data' | 'success_empty';
  version: '202605' | '202509';
  queriedWindow: { startDateGe: string; endDateLt: string };
  latestAvailableDate: string | null;
  totalCount: number | null;
  itemCount: number;
  pagesFetched: number;
  truncatedByPageLimit: boolean;
  observedFields: string[];
  sample: unknown[];
}
type EndpointDiagnostic = { outcome: ConnectionState } | ({ outcome: ApiFailure } & { code?: number; status?: number; message: string }) | SuccessDiagnostic;

interface DiagnosticResponse {
  connection: { status: 'ready' | ConnectionState; sellerName?: string; sellerBaseRegion?: string };
  queriedWindow?: { startDateGe: string; endDateLt: string };
  video: EndpointDiagnostic;
  product: EndpointDiagnostic;
}

const OUTCOME_LABEL: Record<string, string> = {
  not_connected: 'Minha loja não conectada',
  token_expired: 'Token expirado — reconecte',
  insufficient_permission: 'Permissão insuficiente',
  invalid_period: 'Período inválido',
  api_error: 'Erro da API',
  success_with_data: 'Sucesso — com dados',
  success_empty: 'Sucesso — sem dados no período',
};

function isSuccess(d: EndpointDiagnostic): d is SuccessDiagnostic {
  return d.outcome === 'success_with_data' || d.outcome === 'success_empty';
}
function isApiFailure(d: EndpointDiagnostic): d is { outcome: ApiFailure; code?: number; status?: number; message: string } {
  return d.outcome === 'insufficient_permission' || d.outcome === 'invalid_period' || d.outcome === 'api_error';
}

function EndpointResult({ title, diagnostic }: { title: string; diagnostic: EndpointDiagnostic }) {
  const tone = isSuccess(diagnostic) ? 'ok' : diagnostic.outcome === 'not_connected' || diagnostic.outcome === 'token_expired' ? '' : 'is-error';
  return (
    <div className="analysis-card" style={{ marginBottom: 14 }}>
      <div className="config-row">
        <span>
          <strong>{title}</strong>
        </span>
        <strong className={tone === 'ok' ? 'ok' : ''}>{OUTCOME_LABEL[diagnostic.outcome] ?? diagnostic.outcome}</strong>
      </div>

      {isApiFailure(diagnostic) && (
        <p className="auth-message is-error" role="alert">
          {diagnostic.message}
          {diagnostic.code !== undefined && ` (código ${diagnostic.code})`}
        </p>
      )}

      {isSuccess(diagnostic) && (
        <dl>
          <div className="config-row">
            <span>Versão da API usada</span>
            <strong className={diagnostic.version === '202605' ? 'ok' : ''}>
              {diagnostic.version}
              {diagnostic.version === '202509' ? ' (202605 indisponível pra este app — caiu para a anterior)' : ' (mais completa)'}
            </strong>
          </div>
          <div className="config-row">
            <span>Período consultado</span>
            <strong>
              {diagnostic.queriedWindow.startDateGe} até {diagnostic.queriedWindow.endDateLt} (exclusivo)
            </strong>
          </div>
          <div className="config-row">
            <span>Data máxima disponível (segundo a TikTok)</span>
            <strong>{diagnostic.latestAvailableDate ?? 'Não informado pela resposta'}</strong>
          </div>
          <div className="config-row">
            <span>Registros nesta amostra</span>
            <strong>
              {diagnostic.itemCount}
              {diagnostic.totalCount !== null ? ` (total_count da API: ${diagnostic.totalCount})` : ''}
            </strong>
          </div>
          <div className="config-row">
            <span>Páginas percorridas</span>
            <strong>
              {diagnostic.pagesFetched}
              {diagnostic.truncatedByPageLimit ? ' (havia mais — parado no limite de segurança do diagnóstico)' : ''}
            </strong>
          </div>
          <div className="config-row">
            <span>Campos recebidos (1º item)</span>
            <strong>{diagnostic.observedFields.length ? diagnostic.observedFields.join(', ') : '—'}</strong>
          </div>

          {diagnostic.sample.length > 0 ? (
            <>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 6px' }}>Amostra (só os campos abaixo — nunca o payload bruto):</p>
              <pre style={{ fontSize: 11, overflowX: 'auto', background: 'var(--surface)', padding: 10, borderRadius: 'var(--radius-sm)' }}>
                {JSON.stringify(diagnostic.sample, null, 2)}
              </pre>
            </>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
              Nenhum registro no período consultado — a loja de teste pode não ter atividade nesses dias.
            </p>
          )}
        </dl>
      )}
    </div>
  );
}

export function ShopAnalyticsDiagnostic() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/tiktok/shop-analytics-diagnostic', { method: 'POST', headers: { accept: 'application/json' } });
      const data = (await res.json().catch(() => ({}))) as DiagnosticResponse & { error?: string };
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
      {error && (
        <p className="auth-message is-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="config-row">
            <span>Loja usada neste diagnóstico</span>
            <strong>{result.connection.status === 'ready' ? (result.connection.sellerName ?? 'Não informado') : OUTCOME_LABEL[result.connection.status]}</strong>
          </div>
          <EndpointResult title="Get Shop Video Performance List" diagnostic={result.video} />
          <EndpointResult title="Get Shop Product Performance List" diagnostic={result.product} />
        </div>
      )}
    </div>
  );
}
