'use client';
import { useState } from 'react';
import type { Product } from '@/types';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { brl, compact, NA, num, pct, rating, shortDate, text } from '@/lib/format';
import { Heart, Share2, Store, Star, Users, Video } from 'lucide-react';

function growthLabel(value: number | null): string {
  if (value === null) return NA;
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
        <div className="large-image">{product.name.slice(0, 2).toUpperCase()}</div>
        <div className="product-info">
          <div className="breadcrumbs">Produtos / {text(product.category)}</div>
          <span className="status">{text(product.status).toUpperCase()}</span>
          <h1>{product.name}</h1>
          <p>
            {text(product.shop)} · <Star size={12} fill="currentColor" /> {rating(product.rating)}
            {product.reviews !== null ? ` (${product.reviews} avaliações)` : ''}
          </p>
          <div className="price-line">
            <strong>{brl(product.price)}</strong>
            {product.originalPrice && <del>{brl(product.originalPrice)}</del>}
            <span>{product.commission === null ? 'Comissão não informada' : `${product.commission}% comissão`}</span>
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
          <div className="analysis-score">
            <span>{product.opportunityScore === null ? '—' : product.opportunityScore}</span>
            <div>
              <strong>{text(product.status)}</strong>
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
              <dd>{text(product.saturation)}</dd>
            </div>
            <div>
              <dt>Concorrência</dt>
              <dd>{NA}</dd>
            </div>
            <div>
              <dt>Velocidade</dt>
              <dd>{text(product.trend)}</dd>
            </div>
          </dl>
          <p className="explanation">{buildExplanation(product)}</p>
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
          ] as const
        ).map(([a, b], i) => (
          <article key={a}>
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
                  <CartesianGrid vertical={false} stroke="#edf0ee" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip labelFormatter={(label) => shortDate(String(label))} />
                  <Area type="monotone" dataKey="sales" stroke="#167b58" fill="#e7f4ee" strokeWidth={2.5} connectNulls />
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
              <span>{product.newCreators === null ? NA : `+${product.newCreators} perfis desde a sincronização anterior.`}</span>
            </p>
          </div>
          <div>
            <b>03</b>
            <p>
              <strong>Saturação</strong>
              <span>{product.saturation ? `Classificada como ${product.saturation.toLowerCase()}.` : NA}</span>
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
                  <CartesianGrid vertical={false} stroke="#edf0ee" />
                  <XAxis dataKey="date" tickFormatter={shortDate} />
                  <YAxis reversed domain={[1, 100]} />
                  <Tooltip labelFormatter={(label) => shortDate(String(label))} />
                  <Area type="monotone" dataKey="ranking" stroke="#35f2bf" fill="rgba(53,242,191,.08)" strokeWidth={2.5} />
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
          <div>
            <span>Velocidade no ranking</span>
            <strong>{product.rankingVelocity === null ? NA : `${product.rankingVelocity >= 0 ? '+' : ''}${product.rankingVelocity}/dia`}</strong>
          </div>
          <div>
            <span>Momentum</span>
            <strong className={product.momentum !== null && product.momentum >= 0 ? 'growth' : product.momentum !== null ? 'negative' : ''}>
              {product.momentum === null ? NA : `${product.momentum >= 0 ? '+' : ''}${product.momentum}`}
            </strong>
          </div>
          <div>
            <span>Tendência</span>
            <strong>{text(product.trend)}</strong>
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
