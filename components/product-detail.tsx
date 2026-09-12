'use client';
import { useState } from 'react';
import type { Product } from '@/types';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { brl, compact, INSUFFICIENT, NA, num, pct, rating, shortDate, text, TOOLTIP_ESTIMATED_SALES, TOOLTIP_NEEDS_HISTORY, TOOLTIP_NOT_IN_API, TOOLTIP_SCORE_INSUFFICIENT } from '@/lib/format';
import { Heart, Share2, Store, Star, Users, Video } from 'lucide-react';
import { ProductThumb } from './product-thumb';

function growthLabel(value: number | null): string {
  if (value === null) return INSUFFICIENT;
  if (value > 50) return 'Muito alto';
  if (value > 15) return 'Alto';
  if (value >= 0) return 'Estável';
  return 'Em queda';
}

function buildExplanation(product: Product): string {
  const parts: string[] = [];
  if (product.growth7d !== null) parts.push(`as vendas variaram ${pct(product.growth7d)} nos últimos 7 dias`);
  if (product.newCreators) parts.push(`${product.newCreators} novo(s) criador(es) passaram a promover o produto`);
  if (product.saturation) parts.push(`a saturação está classificada como ${product.saturation.toLowerCase()}`);
  if (parts.length === 0) return 'Ainda não há histórico suficiente (mais de uma sincronização) para uma análise de tendência deste produto.';
  return `Com base na sincronização mais recente, ${parts.join('; ')}.`;
}

export function ProductDetail({ product }: { product: Product }) {
  const [fav, setFav] = useState(false);
  const [shared, setShared] = useState(false);

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (navigator.share) await navigator.share({ title: product.name, url });
      else await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* usuário cancelou o compartilhamento; nada a fazer */
    }
  }

  const hasHistory = product.history.length >= 2;
  const hasRankingHistory = product.rankingHistory.length >= 2;

  return (
    <>
      <div className="product-hero">
        <ProductThumb
          className="large-image"
          imageUrl={product.imageUrl}
          productUrl={product.productUrl}
          fallback={product.name.slice(0, 2).toUpperCase()}
        />
        <div className="product-info">
          <div className="breadcrumbs">Produtos / {text(product.category)}</div>
          <span className="status">{product.status === null ? 'DADOS INSUFICIENTES' : text(product.status).toUpperCase()}</span>
          <h1>{product.name}</h1>
          <p>
            {text(product.shop)} · <Star size={12} fill="currentColor" /> {rating(product.rating)}
            {product.reviews !== null ? ` (${product.reviews} avaliações)` : ''}
          </p>
          <div className="price-line">
            <strong>{brl(product.price)}</strong>
            {product.originalPrice && <del>{brl(product.originalPrice)}</del>}
            <span title={TOOLTIP_NOT_IN_API}>{product.commission === null ? 'Comissão não informada' : `${product.commission}% comissão`}</span>
          </div>
          <div className="hero-actions">
            <button onClick={() => setFav((x) => !x)}>
              <Heart size={16} fill={fav ? 'currentColor' : 'none'} /> {fav ? 'Favoritado' : 'Favoritar'}
            </button>
            <button onClick={share}>
              <Share2 size={16} /> {shared ? 'Link copiado!' : 'Compartilhar'}
            </button>
          </div>
        </div>
        <div className="analysis-card">
          <p className="eyebrow green">ANÁLISE TIKRADAR</p>
          <div className="analysis-score" title={product.opportunityScore === null ? TOOLTIP_SCORE_INSUFFICIENT : undefined}>
            <span>{product.opportunityScore === null ? '—' : product.opportunityScore}</span>
            <div>
              <strong>{product.status === null ? INSUFFICIENT : text(product.status)}</strong>
              <small>de 100 pontos</small>
            </div>
          </div>
          <dl>
            <div>
              <dt>Crescimento (7d)</dt>
              <dd>{growthLabel(product.growth7d)}</dd>
            </div>
            <div>
              <dt>Saturação</dt>
              <dd>{product.saturation === null ? INSUFFICIENT : text(product.saturation)}</dd>
            </div>
            <div>
              <dt title={TOOLTIP_NOT_IN_API}>Concorrência</dt>
              <dd>{NA}</dd>
            </div>
            <div>
              <dt>Velocidade</dt>
              <dd>{product.trend === null ? INSUFFICIENT : text(product.trend)}</dd>
            </div>
          </dl>
          <p className="explanation">{buildExplanation(product)}</p>
          {product.opportunityFactors.length > 0 && (
            <ul className="score-factors">
              {product.opportunityFactors.map((f) => (
                <li key={f.label}>
                  <span>{f.label}</span>
                  <b>{f.normalizedValue}/100</b>
                  <small>peso {f.weight}%</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="detail-stats">
        {(
          [
            ['Vendas (7d)', compact(product.sales7d)],
            ['GMV estimado', brl(product.gmv)],
            ['Criadores', num(product.creators)],
            ['Vídeos', num(product.videos)],
            ['Avaliações', product.reviews === null ? NA : String(product.reviews)],
            ['Vendas estimadas', compact(product.estimatedSales), TOOLTIP_ESTIMATED_SALES],
          ] as const
        ).map(([a, b, title], i) => (
          <article key={a} title={title}>
            <span>{i === 2 ? <Users /> : i === 3 ? <Video /> : <Store />}</span>
            <p>{a}</p>
            <strong>{b}</strong>
          </article>
        ))}
      </div>

      <div className="detail-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Vendas ao longo do tempo</h2>
              <p>Snapshots reais da sincronização</p>
            </div>
            {product.growth7d !== null && <span className="trend">{product.growth7d >= 0 ? '↗' : '↘'} {product.growth7d}%</span>}
          </div>
          <div className="chart detail-chart">
            {hasHistory ? (
              <ResponsiveContainer>
                <AreaChart data={product.history}>
                  <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip labelFormatter={(label) => shortDate(String(label))} />
                  <Area type="monotone" dataKey="sales" stroke="var(--teal)" fill="var(--teal-soft)" strokeWidth={2} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">
                <p>Histórico insuficiente para um gráfico de tendência.</p>
                <small>Aparece a partir da segunda sincronização deste produto.</small>
              </div>
            )}
          </div>
        </article>
        <article className="panel insights">
          <h2>Sinais observados</h2>
          <div>
            <b>01</b>
            <p>
              <strong>Vendas (7d)</strong>
              <span>{product.growth7d === null ? 'Sem histórico suficiente ainda.' : `Variaram ${pct(product.growth7d)} desde a sincronização anterior.`}</span>
            </p>
          </div>
          <div>
            <b>02</b>
            <p>
              <strong>Novos criadores</strong>
              <span title={product.newCreators === null ? TOOLTIP_NEEDS_HISTORY : undefined}>
                {product.newCreators === null ? INSUFFICIENT : `+${product.newCreators} perfis desde a sincronização anterior.`}
              </span>
            </p>
          </div>
          <div>
            <b>03</b>
            <p>
              <strong>Saturação</strong>
              <span title={product.saturation === null ? TOOLTIP_SCORE_INSUFFICIENT : undefined}>
                {product.saturation ? `Classificada como ${product.saturation.toLowerCase()}.` : INSUFFICIENT}
              </span>
            </p>
          </div>
        </article>
      </div>

      <div className="ranking-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Posição no ranking</h2>
              <p>Evolução real entre sincronizações</p>
            </div>
            {product.rankingVelocity !== null && (
              <span className="trend">
                {product.rankingVelocity >= 0 ? '↑' : '↓'} {Math.abs(product.rankingVelocity)} posições/dia
              </span>
            )}
          </div>
          <div className="chart detail-chart">
            {hasRankingHistory ? (
              <ResponsiveContainer>
                <AreaChart data={product.rankingHistory}>
                  <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: 'var(--muted-2)', fontSize: 11 }} />
                  <YAxis reversed domain={[1, 100]} tick={{ fill: 'var(--muted-2)', fontSize: 11 }} />
                  <Tooltip labelFormatter={(label) => shortDate(String(label))} />
                  <Area type="monotone" dataKey="ranking" stroke="var(--teal)" fill="var(--teal-soft)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">
                <p>Só existe um snapshot de ranking até agora.</p>
                <small>O gráfico ganha forma a partir da próxima sincronização.</small>
              </div>
            )}
          </div>
        </article>
        <article className="panel ranking-signals">
          <h2>Sinais do Radar</h2>
          <div title={product.rankingVelocity === null ? TOOLTIP_NEEDS_HISTORY : undefined}>
            <span>Velocidade no ranking</span>
            <strong>{product.rankingVelocity === null ? INSUFFICIENT : `${product.rankingVelocity >= 0 ? '+' : ''}${product.rankingVelocity}/dia`}</strong>
          </div>
          <div title={product.momentum === null ? TOOLTIP_NEEDS_HISTORY : undefined}>
            <span>Momentum</span>
            <strong className={product.momentum !== null && product.momentum >= 0 ? 'growth' : product.momentum !== null ? 'negative' : ''}>
              {product.momentum === null ? INSUFFICIENT : `${product.momentum >= 0 ? '+' : ''}${product.momentum}`}
            </strong>
          </div>
          <div>
            <span>Tendência</span>
            <strong>{product.trend === null ? INSUFFICIENT : text(product.trend)}</strong>
          </div>
        </article>
      </div>

      <article className="panel related">
        <div className="panel-head">
          <div>
            <h2>Principais criadores</h2>
            <p>Quem está impulsionando este produto</p>
          </div>
          <a className="link" href="/creators">
            Ver todos →
          </a>
        </div>
        <div className="empty-state">
          <p>Ainda não sincronizamos quais criadores estão associados a este produto específico.</p>
        </div>
      </article>
    </>
  );
}
