import { BarChart3, Box, Compass, Sparkles, Radio } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { GmvChart } from '@/components/gmv-chart';
import { EmptyState, ErrorState } from '@/components/state-message';
import { brl, compact, num, pct, text } from '@/lib/format';
import { getTikTokDataProvider } from '@/lib/providers/provider-factory';
import { requireSessionUser } from '@/lib/auth/session';
import { aggregateDailyGmv } from '@/lib/tiktok/gmv-series';
import type { Live, Product } from '@/types';

export const dynamic = 'force-dynamic';

function sumOrNull(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((sum, v) => sum + v, 0) : null;
}

export default async function Dashboard() {
  const user = await requireSessionUser('/dashboard');
  const firstName = (user.fullName ?? user.email).split(/[\s@]/)[0];

  let products: Product[];
  let lives: Live[];
  try {
    const provider = getTikTokDataProvider();
    [products, lives] = await Promise.all([provider.getProducts(), provider.getLives()]);
  } catch {
    return (
      <AppShell active="/dashboard">
        <div className="page">
          <ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes." />
        </div>
      </AppShell>
    );
  }

  if (products.length === 0) {
    return (
      <AppShell active="/dashboard">
        <div className="page">
          <div className="title-row">
            <div>
              <p className="eyebrow green">VISÃO GERAL</p>
              <h1>Olá, {firstName}.</h1>
            </div>
          </div>
          <EmptyState
            title="Nenhum produto sincronizado ainda"
            description="Conecte a TikTok Shop e rode a primeira sincronização em Admin → Integrações → TikTok Shop."
            action={<a href="/admin/integrations/tiktok">Ir para integrações →</a>}
          />
        </div>
      </AppShell>
    );
  }

  const top = [...products]
    .sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1) || (b.growth7d ?? -Infinity) - (a.growth7d ?? -Infinity))
    .slice(0, 3);

  const gmvTotal = sumOrNull(products.map((p) => p.gmv));
  const salesTotal = sumOrNull(products.map((p) => p.sales24h));
  const opportunities = products.filter((p) => (p.opportunityScore ?? -1) >= 80).length;
  const gmvSeries = aggregateDailyGmv(products);

  const stats = [
    ['GMV analisado', brl(gmvTotal), 'Últimos 7 dias'],
    ['Vendas analisadas', salesTotal === null ? 'Não informado' : compact(salesTotal), 'Últimas 24h'],
    ['Produtos monitorados', compact(products.length), 'Catálogo atual'],
    ['Oportunidades detectadas', String(opportunities), 'Score ≥ 80'],
  ];

  return (
    <AppShell active="/dashboard">
      <div className="page">
        <div className="title-row">
          <div>
            <p className="eyebrow green">VISÃO GERAL</p>
            <h1>Olá, {firstName}.</h1>
            <p>Veja o que está movimentando o TikTok Shop hoje.</p>
          </div>
        </div>
        <div className="stats">
          {stats.map((s, i) => (
            <article key={s[0]}>
              <div className={'stat-icon i' + i}>{i === 0 ? <BarChart3 /> : i === 1 ? <Sparkles /> : i === 2 ? <Box /> : <Compass />}</div>
              <p>{s[0]}</p>
              <div>
                <strong>{s[1]}</strong>
                <span>{s[2]}</span>
              </div>
            </article>
          ))}
        </div>
        <div className="main-grid">
          <article className="panel chart-panel">
            <div className="panel-head">
              <div>
                <h2>GMV ao longo do tempo</h2>
                <p>Volume bruto de mercadorias analisado</p>
              </div>
            </div>
            <div className="chart">
              <GmvChart data={gmvSeries} />
            </div>
          </article>
          <article className="panel radar-card">
            <div className="panel-head">
              <div>
                <p className="eyebrow green">RADAR</p>
                <h2>Sinais de oportunidade</h2>
              </div>
              <span className="pulse">
                <i /> AO VIVO
              </span>
            </div>
            <strong className="big-number">{opportunities}</strong>
            <p>produtos com Opportunity Score ≥ 80 no catálogo sincronizado</p>
            <div className="radar-lines">
              <span style={{ width: '88%' }} />
              <span style={{ width: '62%' }} />
              <span style={{ width: '76%' }} />
            </div>
            <a href="/radar">
              Explorar Radar <span>→</span>
            </a>
          </article>
        </div>
        <article className="panel table-panel">
          <div className="panel-head">
            <div>
              <h2>Produtos em destaque</h2>
              <p>Melhor Opportunity Score; sem score, ordenado por crescimento de vendas (7d)</p>
            </div>
            <a className="link" href="/products">
              Ver todos →
            </a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PRODUTO</th>
                  <th>CATEGORIA</th>
                  <th>PREÇO</th>
                  <th>VENDAS (7D)</th>
                  <th>CRESCIMENTO (7D)</th>
                  <th>OPORTUNIDADE</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <span className={'product-img p' + i}>{p.name.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>{text(p.shop)}</small>
                      </div>
                    </td>
                    <td>
                      <span className="tag">{text(p.category)}</span>
                    </td>
                    <td>{brl(p.price)}</td>
                    <td>
                      <strong>{compact(p.sales7d)}</strong>
                    </td>
                    <td>
                      {p.growth7d === null ? (
                        <span>{pct(p.growth7d)}</span>
                      ) : (
                        <span className={p.growth7d >= 0 ? 'growth' : 'negative'}>
                          {p.growth7d >= 0 ? '↗' : '↘'} {p.growth7d}%
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="score">{p.opportunityScore === null ? '—' : p.opportunityScore}</span>
                      <div className="score-text">
                        <strong>{text(p.status)}</strong>
                        <small>{p.saturation ? `Saturação ${p.saturation.toLowerCase()}` : 'Saturação não informada'}</small>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        {lives.length > 0 && (
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow green">
                  <Radio size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />
                  LIVES
                </p>
                <h2>Lives em destaque</h2>
              </div>
            </div>
            <div className="lives-list">
              {lives.slice(0, 5).map((l) => (
                <div key={l.id}>
                  <span>
                    #{num(l.ranking)} · {l.name}
                  </span>
                  <small>{brl(l.gmv)}</small>
                </div>
              ))}
            </div>
          </article>
        )}
      </div>
    </AppShell>
  );
}
