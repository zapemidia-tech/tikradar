'use client';
import { useState } from 'react';
import type { Product } from '@/types';
import { ArrowUpRight, Heart, Sparkles, Users, Video } from 'lucide-react';
import { brl, compact, num, text } from '@/lib/format';
import { EmptyState } from './state-message';

const FILTERS = ['Todos', 'Crescimento explosivo', 'Baixa saturação', 'Alta comissão', 'Poucos criadores'] as const;

export function RadarGrid({ products }: { products: Product[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Todos');
  const [favs, setFavs] = useState<string[]>([]);

  const visible = products
    .filter(
      (p) =>
        filter === 'Todos' ||
        (filter === 'Crescimento explosivo' && (p.growth7d ?? -Infinity) > 200) ||
        (filter === 'Baixa saturação' && p.saturation !== null && ['Baixa', 'Muito baixa'].includes(p.saturation)) ||
        (filter === 'Alta comissão' && (p.commission ?? -1) >= 15) ||
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
                <span className={'opp-image c' + (i % 4)}>{p.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <span className="status">
                    <Sparkles size={11} />
                    {text(p.status).toUpperCase()}
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
                <span>Comissão {p.commission === null ? 'não informada' : `${p.commission}%`}</span>
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
                <div>
                  <small>CRESCIMENTO</small>
                  {p.growth7d === null ? (
                    <strong>Não informado</strong>
                  ) : (
                    <strong className="growth">
                      {p.growth7d >= 0 ? '↗' : '↘'} {p.growth7d}%
                    </strong>
                  )}
                </div>
              </div>
              <div className="ranking-mini">
                <span>
                  Ranking Velocity <b>{p.rankingVelocity === null ? '—' : `${p.rankingVelocity >= 0 ? '+' : ''}${p.rankingVelocity}`}</b>
                </span>
                <span>
                  Momentum <b>{p.momentum === null ? '—' : `${p.momentum >= 0 ? '+' : ''}${p.momentum}`}</b>
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
              <div className="opp-bottom">
                <div className="radial-score" style={{ '--score': `${(p.opportunityScore ?? 0) * 3.6}deg` } as React.CSSProperties}>
                  <span>{p.opportunityScore === null ? '—' : p.opportunityScore}</span>
                </div>
                <div>
                  <small>OPPORTUNITY SCORE</small>
                  <strong>{text(p.status)}</strong>
                </div>
                <span className="sat">Saturação {p.saturation ? p.saturation.toLowerCase() : 'não informada'}</span>
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
