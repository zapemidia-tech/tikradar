import { BarChart3, Box, Compass, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { GmvChart } from '@/components/gmv-chart';
import { brl, compact } from '@/lib/format';
import { getTikTokDataProvider } from '@/lib/providers/provider-factory';
import { requireSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await requireSessionUser('/dashboard');
  const firstName = (user.fullName ?? user.email).split(/[\s@]/)[0];

  const products = await getTikTokDataProvider().getProducts();
  const top = [...products].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 3);

  const gmvTotal = products.reduce((sum, p) => sum + p.gmv, 0);
  const salesTotal = products.reduce((sum, p) => sum + p.sales24h, 0);
  const opportunities = products.filter((p) => p.opportunityScore >= 80).length;

  const stats = [
    ['GMV analisado', brl(gmvTotal), 'Últimos 7 dias'],
    ['Vendas analisadas', compact(salesTotal), 'Últimas 24h'],
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
              <span className="trend">↗ 18,2%</span>
            </div>
            <div className="chart">
              <GmvChart />
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
            <p>novos produtos promissores detectados hoje</p>
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
              <h2>Produtos em maior crescimento</h2>
              <p>Itens com aceleração relevante e saturação controlada</p>
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
                  <th>VENDAS 24H</th>
                  <th>CRESCIMENTO</th>
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
                        <small>{p.shop}</small>
                      </div>
                    </td>
                    <td>
                      <span className="tag">{p.category}</span>
                    </td>
                    <td>{brl(p.price)}</td>
                    <td>
                      <strong>{compact(p.sales24h)}</strong>
                    </td>
                    <td>
                      <span className={p.growth24h >= 0 ? 'growth' : 'negative'}>
                        {p.growth24h >= 0 ? '↗' : '↘'} {p.growth24h}%
                      </span>
                    </td>
                    <td>
                      <span className="score">{p.opportunityScore}</span>
                      <div className="score-text">
                        <strong>{p.status}</strong>
                        <small>Saturação {p.saturation.toLowerCase()}</small>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </AppShell>
  );
}
