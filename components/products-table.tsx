'use client';
import { useMemo, useState } from 'react';
import type { Product } from '@/types';
import { Heart, Search, SlidersHorizontal } from 'lucide-react';
import { brl, compact, num, text } from '@/lib/format';
import { EmptyState } from './state-message';

const PAGE_SIZE = 20;

export function ProductsTable({ products }: { products: Product[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('score');
  const [page, setPage] = useState(1);
  const [favs, setFavs] = useState<string[]>([]);

  const filtered = useMemo(
    () =>
      products
        .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) =>
          sort === 'growth'
            ? (b.growth7d ?? -Infinity) - (a.growth7d ?? -Infinity)
            : sort === 'sales'
              ? (b.sales7d ?? -Infinity) - (a.sales7d ?? -Infinity)
              : (b.opportunityScore ?? -Infinity) - (a.opportunityScore ?? -Infinity),
        ),
    [products, q, sort],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateFilter(value: string) {
    setQ(value);
    setPage(1);
  }

  function updateSort(value: string) {
    setSort(value);
    setPage(1);
  }

  return (
    <>
      <div className="filterbar">
        <label>
          <Search size={15} />
          <input value={q} onChange={(e) => updateFilter(e.target.value)} placeholder="Pesquisar produto..." />
        </label>
        <button>
          <SlidersHorizontal size={14} /> Filtros avançados
        </button>
        <select value={sort} onChange={(e) => updateSort(e.target.value)}>
          <option value="score">Maior Opportunity Score</option>
          <option value="growth">Maior crescimento</option>
          <option value="sales">Mais vendidos</option>
        </select>
      </div>
      <article className="panel table-panel">
        {filtered.length === 0 ? (
          <EmptyState title="Nenhum produto encontrado" description="Ajuste a busca ou aguarde a próxima sincronização." />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PRODUTO</th>
                    <th>PREÇO</th>
                    <th>VENDAS 24H</th>
                    <th>GMV 7D</th>
                    <th>CRESCIMENTO</th>
                    <th>CRIADORES</th>
                    <th>SATURAÇÃO</th>
                    <th>SCORE</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p, i) => (
                    <tr key={p.id}>
                      <td>
                        <span className={'product-img p' + (i % 3)}>{p.name.slice(0, 2).toUpperCase()}</span>
                        <div>
                          <a href={`/products/${p.id}`}>
                            <strong>{p.name}</strong>
                          </a>
                          <small>
                            {text(p.shop)} · {text(p.category)}
                          </small>
                        </div>
                      </td>
                      <td>
                        <strong>{brl(p.price)}</strong>
                        {p.originalPrice && <small className="strike">{brl(p.originalPrice)}</small>}
                      </td>
                      <td>{compact(p.sales24h)}</td>
                      <td>{brl(p.gmv)}</td>
                      <td>
                        {p.growth7d === null ? (
                          <span>Não informado</span>
                        ) : (
                          <span className={p.growth7d >= 0 ? 'growth' : 'negative'}>
                            {p.growth7d >= 0 ? '↗' : '↘'} {p.growth7d}%
                          </span>
                        )}
                      </td>
                      <td>{num(p.creators)}</td>
                      <td>
                        {p.saturation ? (
                          <span className={'sat ' + p.saturation.replace(' ', '-').toLowerCase()}>{p.saturation}</span>
                        ) : (
                          <span className="sat">Não informada</span>
                        )}
                      </td>
                      <td>
                        <span className="score">{p.opportunityScore === null ? '—' : p.opportunityScore}</span>
                        <div className="score-text">
                          <strong>{text(p.status)}</strong>
                          <small>{num(p.videos)} vídeos</small>
                        </div>
                      </td>
                      <td>
                        <button
                          className={favs.includes(p.id) ? 'fav on' : 'fav'}
                          aria-label="Favoritar"
                          onClick={() => setFavs((x) => (x.includes(p.id) ? x.filter((id) => id !== p.id) : [...x, p.id]))}
                        >
                          <Heart size={15} fill="currentColor" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Mostrando {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de{' '}
                {filtered.length}
              </span>
              <div>
                <button disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} className={n === currentPage ? 'active' : ''} onClick={() => setPage(n)}>
                    {n}
                  </button>
                ))}
                <button disabled={currentPage === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </article>
    </>
  );
}
