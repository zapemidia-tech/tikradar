'use client';
import { useMemo, useState } from 'react';
import type { GmvTierId, NewInRadarProduct } from '@/types';
import { GMV_TIERS } from '@/lib/scoring/new-in-radar';
import { ArrowUpRight, Search, Sparkles, TrendingUp } from 'lucide-react';
import {
  brl,
  fullDate,
  HISTORY_INSUFFICIENT,
  num,
  relativeDate,
  TOOLTIP_FIRST_DETECTED,
  TOOLTIP_GMV_TIER_CONSERVATIVE,
  TOOLTIP_GROWTH_NEEDS_HISTORY,
  TOOLTIP_OPEN_PRODUCT,
} from '@/lib/format';
import { ProductThumb } from './product-thumb';
import { EmptyState } from './state-message';

type SortKey = 'recent' | 'gmv' | 'gmvGrowth' | 'ranking';

const SORTERS: Record<SortKey, (a: NewInRadarProduct, b: NewInRadarProduct) => number> = {
  recent: (a, b) => new Date(b.firstDetectedAt).getTime() - new Date(a.firstDetectedAt).getTime(),
  gmv: (a, b) => b.gmvRangeMin - a.gmvRangeMin,
  gmvGrowth: (a, b) => (b.gmvGrowthPct ?? -Infinity) - (a.gmvGrowthPct ?? -Infinity),
  ranking: (a, b) => {
    const deltaOf = (x: NewInRadarProduct) => (x.previousRanking === null ? -Infinity : x.previousRanking - x.ranking);
    return deltaOf(b) - deltaOf(a);
  },
};

function rankingChangeLabel(previousRanking: number | null, ranking: number): { text: string; tone: 'growth' | 'negative' | '' } {
  if (previousRanking === null) return { text: HISTORY_INSUFFICIENT, tone: '' };
  const delta = previousRanking - ranking;
  if (delta > 0) return { text: `↑ ${delta} posições`, tone: 'growth' };
  if (delta < 0) return { text: `↓ ${Math.abs(delta)} posições`, tone: 'negative' };
  return { text: '= sem mudança', tone: '' };
}

export function NewInRadarGrid({ items }: { items: NewInRadarProduct[] }) {
  const [tier, setTier] = useState<GmvTierId | 'all'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  const tierCounts = useMemo(() => {
    const counts: Record<GmvTierId, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const item of items) counts[item.gmvTier]++;
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items
      .filter((p) => tier === 'all' || p.gmvTier === tier)
      .filter((p) => !query || p.name.toLowerCase().includes(query) || (p.shop ?? '').toLowerCase().includes(query))
      .sort(SORTERS[sort]);
  }, [items, tier, q, sort]);

  return (
    <>
      <div className="radar-summary">
        {GMV_TIERS.map((t) => (
          <div key={t.id}>
            <span>{tierCounts[t.id]}</span>
            <p>{t.label}</p>
          </div>
        ))}
      </div>

      <div className="radar-filters" role="tablist" aria-label="Faixa de GMV">
        <button type="button" className={tier === 'all' ? 'active' : ''} onClick={() => setTier('all')}>
          Todos ({items.length})
        </button>
        {GMV_TIERS.map((t) => (
          <button key={t.id} type="button" className={tier === t.id ? 'active' : ''} onClick={() => setTier(t.id)}>
            {t.label} ({tierCounts[t.id]})
          </button>
        ))}
      </div>

      <div className="filterbar">
        <label>
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por produto ou loja..." />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="recent">Detectados mais recentemente</option>
          <option value="gmv">Maior GMV (limite inferior)</option>
          <option value="gmvGrowth">Maior crescimento de GMV</option>
          <option value="ranking">Maior ganho de posições</option>
        </select>
      </div>

      <p className="nir-note" title={TOOLTIP_GMV_TIER_CONSERVATIVE}>
        Classificação conservadora baseada no limite inferior do GMV informado pelo TikTok.
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum produto encontrado"
          description={
            items.length === 0
              ? 'Nenhum produto detectado nos últimos 7 dias até agora.'
              : 'Ajuste a busca ou a faixa de GMV selecionada.'
          }
        />
      ) : (
        <div className="opportunity-grid">
          {filtered.map((p, i) => {
            const rankingChange = rankingChangeLabel(p.previousRanking, p.ranking);
            const tierDef = GMV_TIERS.find((t) => t.id === p.gmvTier)!;
            return (
              <article className="opportunity-card" key={p.id}>
                <div className="opp-top">
                  <ProductThumb className={'opp-image c' + (i % 4)} imageUrl={p.imageUrl} productUrl={p.productUrl} fallback={p.name.slice(0, 2).toUpperCase()} />
                  <div>
                    <span className={p.hasConfirmedGrowth ? 'status nir-status-growth' : 'status'}>
                      {p.hasConfirmedGrowth ? <TrendingUp size={11} /> : <Sparkles size={11} />}
                      {p.hasConfirmedGrowth ? 'CRESCIMENTO CONFIRMADO' : 'DETECÇÃO RECENTE'}
                    </span>
                    <h2>{p.name}</h2>
                    <p>{p.shop ?? 'Loja não informada'}</p>
                  </div>
                </div>

                <div className="nir-gmv" title={TOOLTIP_GMV_TIER_CONSERVATIVE}>
                  <strong>
                    {brl(p.gmvRangeMin)} – {brl(p.gmvRangeMax)}
                  </strong>
                  <span className="tag">{tierDef.label}</span>
                </div>

                <p className="nir-detected" title={TOOLTIP_FIRST_DETECTED}>
                  Detectado pelo TikRadar em <b>{fullDate(p.firstDetectedAt)}</b> ({relativeDate(p.firstDetectedAt)}) — pode existir há mais tempo na TikTok Shop.
                </p>

                <div className="opp-metrics">
                  <div>
                    <small>RANKING ATUAL</small>
                    <strong>#{p.ranking}</strong>
                  </div>
                  <div title={p.previousRanking === null ? TOOLTIP_GROWTH_NEEDS_HISTORY : undefined}>
                    <small>EVOLUÇÃO DO RANKING</small>
                    <strong className={rankingChange.tone}>{rankingChange.text}</strong>
                  </div>
                  <div title={p.gmvGrowthPct === null ? TOOLTIP_GROWTH_NEEDS_HISTORY : undefined}>
                    <small>CRESCIMENTO DE GMV</small>
                    <strong className={p.gmvGrowthPct !== null && p.gmvGrowthPct >= 0 ? 'growth' : p.gmvGrowthPct !== null ? 'negative' : ''}>
                      {p.gmvGrowthPct === null ? HISTORY_INSUFFICIENT : `${p.gmvGrowthPct >= 0 ? '+' : ''}${p.gmvGrowthPct}%`}
                    </strong>
                  </div>
                  <div title="Quantidade de capturas 7D já registradas para este produto — 1 = só a 1ª detecção, ainda sem evolução comparável.">
                    <small>SNAPSHOTS 7D</small>
                    <strong>{p.snapshotsCount}</strong>
                  </div>
                </div>

                <div className="signal-row nir-unavailable">
                  <span>Preço: {brl(p.price)}</span>
                  <span>Vendido: {num(p.soldCount)}</span>
                  <span>Comissão: {p.commission === null ? 'Não informada' : `${p.commission}%`}</span>
                  <span>Criadores: {num(p.creators)}</span>
                </div>

                {p.productUrl && (
                  <a href={p.productUrl} target="_blank" rel="noopener noreferrer" title={TOOLTIP_OPEN_PRODUCT}>
                    Ver produto na TikTok Shop <ArrowUpRight size={14} />
                  </a>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
