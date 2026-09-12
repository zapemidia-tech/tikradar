'use client';
import { useState } from 'react';
import type { Product } from '@/types';
import { ArrowUpRight, Heart, Sparkles, Users, Video } from 'lucide-react';
import { brl, compact, growthPct, num, text, TOOLTIP_ESTIMATED_SALES, TOOLTIP_NEEDS_HISTORY, TOOLTIP_SCORE_INSUFFICIENT } from '@/lib/format';
import { EmptyState } from './state-message';
import { ProductThumb } from './product-thumb';

// "Alta comissão" saiu: nenhuma API autorizada configurada neste projeto
// retorna comissão (ver README), então esse filtro nunca teria resultado
// com dados reais — troquei por "Alto rating", que usa um campo real.
const FILTERS = ['Todos', 'Crescimento explosivo', 'Baixa saturação', 'Alto rating', 'Poucos criadores'] as const;

export function RadarGrid({ products }: { products: Product[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Todos');
  const [favs, setFavs] = useState<string[]>([]);

  const visible = products
    .filter(
      (p) =>
        filter === 'Todos' ||
        (filter === 'Crescimento explosivo' && (p.growth7d ?? -Infinity) > 200) ||
        (filter === 'Baixa saturação' && p.saturation !== null && ['Baixa', 'Muito baixa'].includes(p.saturation)) ||
        (filter === 'Alto rating' && (p.rating ?? 0) >= 4.5) ||
        (filter === 'Poucos criadores' && (p.creators ?? Infinity) < 50),
    )
    .slice(0, 12);

  return (
    <>
      <div className="radar-filters">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'active' : ''}>
            {f}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyState title="Nenhum produto encontrado" description="Ajuste o filtro ou aguarde mais dados sincronizados." />
      ) : (
        <div className="opportunity-grid">
          {visible.map((p, i) => (
            <article className="opportunity-card" key={p.id}>
              <div className="opp-top">
                <ProductThumb
                  className={'opp-image c' + (i % 4)}
                  imageUrl={p.imageUrl}
                  productUrl={p.productUrl}
                  fallback={p.name.slice(0, 2).toUpperCase()}
                />
                <div>
                  <span className="status">
                    <Sparkles size={11} />
                    {p.status === null ? 'DADOS INSUFICIENTES' : text(p.status).toUpperCase()}
                  </span>
                  <h2>{p.name}</h2>
                  <p>
                    {text(p.shop)} · {text(p.category)}
                  </p>
                </div>
                <button
                  aria-label="Favoritar"
                  onClick={() => setFavs((x) => (x.includes(p.id) ? x.filter((id) => id !== p.id) : [...x, p.id]))}
                >
                  <Heart size={16} fill={favs.includes(p.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="opp-price">
                <strong>{brl(p.price)}</strong>
                <span title="Nenhuma API autorizada configurada neste projeto fornece comissão.">
                  Comissão {p.commission === null ? 'não informada' : `${p.commission}%`}
                </span>
              </div>
              <div className="opp-metrics">
                <div>
                  <small>VENDAS (7D)</small>
                  <strong>{compact(p.sales7d)}</strong>
                </div>
                <div>
                  <small>GMV 7 DIAS</small>
                  <strong>{brl(p.gmv)}</strong>
                </div>
                <div title={p.growth7d === null ? TOOLTIP_NEEDS_HISTORY : undefined}>
                  <small>CRESCIMENTO</small>
                  {p.growth7d === null ? (
                    <strong>{growthPct(p.growth7d)}</strong>
                  ) : (
                    <strong className="growth">
                      {p.growth7d >= 0 ? '↗' : '↘'} {p.growth7d}%
                    </strong>
                  )}
                </div>
                <div title={TOOLTIP_ESTIMATED_SALES}>
                  <small>VENDAS ESTIMADAS</small>
                  <strong>{compact(p.estimatedSales)}</strong>
                </div>
              </div>
              <div className="ranking-mini">
                <span title={p.rankingVelocity === null ? TOOLTIP_NEEDS_HISTORY : undefined}>
                  Ranking Velocity <b>{p.rankingVelocity === null ? 'Dados insuficientes' : `${p.rankingVelocity >= 0 ? '+' : ''}${p.rankingVelocity}`}</b>
                </span>
                <span title={p.momentum === null ? TOOLTIP_NEEDS_HISTORY : undefined}>
                  Momentum <b>{p.momentum === null ? 'Dados insuficientes' : `${p.momentum >= 0 ? '+' : ''}${p.momentum}`}</b>
                </span>
              </div>
              <div className="signal-row">
                <span>
                  <Users size={13} />
                  {num(p.creators)} criadores <b>{p.newCreators === null ? '' : `+${p.newCreators}`}</b>
                </span>
                <span>
                  <Video size={13} />
                  {num(p.videos)} vídeos <b>{p.newVideos === null ? '' : `+${p.newVideos}`}</b>
                </span>
              </div>
              <div className="opp-bottom" title={p.opportunityScore === null ? TOOLTIP_SCORE_INSUFFICIENT : undefined}>
                <div className="radial-score" style={{ '--score': `${(p.opportunityScore ?? 0) * 3.6}deg` } as React.CSSProperties}>
                  <span>{p.opportunityScore === null ? '—' : p.opportunityScore}</span>
                </div>
                <div>
                  <small>OPPORTUNITY SCORE</small>
                  <strong>{p.status === null ? 'Dados insuficientes' : text(p.status)}</strong>
                </div>
                <span className="sat">Saturação {p.saturation ? p.saturation.toLowerCase() : 'dados insuficientes'}</span>
              </div>
              <a href={`/products/${p.id}`}>
                Ver análise completa <ArrowUpRight size={14} />
              </a>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
