'use client';
import type { Creator, Shop, Video } from '@/types';
import { brl, compact, growthPct, num, relativeDate, text, TOOLTIP_NEEDS_HISTORY, TOOLTIP_NOT_IN_API } from '@/lib/format';
import { EmptyState } from './state-message';

export function CreatorsTable({ items }: { items: Creator[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhum criador sincronizado ainda" description="Rode uma sincronização em Admin → Integrações → TikTok Shop." />;
  }
  return (
    <article className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CRIADOR</th>
              <th>SEGUIDORES</th>
              <th title={TOOLTIP_NOT_IN_API}>VENDAS</th>
              <th>GMV</th>
              <th>PRODUTOS</th>
              <th>VIEWS</th>
              <th>ENGAJAMENTO</th>
              <th>CRESCIMENTO (GMV)</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 25).map((x, i) => (
              <tr key={x.id}>
                <td>
                  <span className={'avatar a' + (i % 4)}>{x.name.slice(0, 2)}</span>
                  <div>
                    <strong>{x.name}</strong>
                    <small>{text(x.username)}</small>
                  </div>
                </td>
                <td title={x.followers === null ? TOOLTIP_NOT_IN_API : undefined}>{compact(x.followers)}</td>
                <td>{compact(x.sales)}</td>
                <td>{brl(x.gmv)}</td>
                <td title={x.products === null ? TOOLTIP_NOT_IN_API : undefined}>{num(x.products)}</td>
                <td title={x.views === null ? TOOLTIP_NOT_IN_API : undefined}>{compact(x.views)}</td>
                <td title={x.engagement === null ? TOOLTIP_NOT_IN_API : undefined}>
                  {x.engagement === null ? 'Não informado' : `${x.engagement.toFixed(1)}%`}
                </td>
                <td title={x.growth === null ? TOOLTIP_NEEDS_HISTORY : undefined}>
                  {x.growth === null ? (
                    growthPct(x.growth)
                  ) : (
                    <span className={x.growth >= 0 ? 'growth' : 'negative'}>
                      {x.growth >= 0 ? '↗' : '↘'} {x.growth}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function ShopsTable({ items }: { items: Shop[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Lojas ainda não fazem parte da sincronização"
        description="A sincronização atual cobre produtos, criadores, vídeos e lives. Lojas continuam demonstrativas por enquanto."
      />
    );
  }
  return (
    <article className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>LOJA</th>
              <th>CATEGORIA</th>
              <th>PRODUTOS ATIVOS</th>
              <th>VENDAS</th>
              <th>GMV</th>
              <th>CRESCIMENTO</th>
              <th>AVALIAÇÃO</th>
              <th>CRIADORES</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={x.id}>
                <td>
                  <span className={'avatar a' + (i % 4)}>{x.name.slice(0, 2)}</span>
                  <div>
                    <strong>{x.name}</strong>
                    <small>Loja verificada</small>
                  </div>
                </td>
                <td>
                  <span className="tag">{x.category}</span>
                </td>
                <td>{x.activeProducts}</td>
                <td>{compact(x.sales)}</td>
                <td>{brl(x.gmv)}</td>
                <td>
                  <span className="growth">↗ {x.growth}%</span>
                </td>
                <td>★ {x.rating.toFixed(1)}</td>
                <td>{x.creators}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function VideosTable({ items }: { items: Video[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhum vídeo sincronizado ainda" description="Rode uma sincronização em Admin → Integrações → TikTok Shop." />;
  }
  return (
    <article className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>VÍDEO / PRODUTO</th>
              <th>CRIADOR</th>
              <th>VIEWS</th>
              <th>ENGAJAMENTO</th>
              <th title={TOOLTIP_NOT_IN_API}>VENDAS ATRIBUÍDAS</th>
              <th>GMV</th>
              <th>POSTADO</th>
              <th>CRESCIMENTO (VIEWS)</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 30).map((x, i) => {
              const engagementCount = x.likes !== null && x.comments !== null && x.shares !== null ? x.likes + x.comments + x.shares : null;
              const engagementRate = engagementCount !== null && x.views ? (engagementCount / x.views) * 100 : null;
              return (
                <tr key={x.id}>
                  <td>
                    <span className={'video-thumb v' + (i % 4)}>▶</span>
                    <div>
                      <strong>{text(x.product)}</strong>
                      <small>
                        {x.likes === null && x.shares === null
                          ? 'Curtidas/compartilhamentos não informados'
                          : `${compact(x.likes)} curtidas · ${compact(x.shares)} compartilhamentos`}
                      </small>
                    </div>
                  </td>
                  <td title={x.creator === null ? 'A resposta de vídeos não traz um identificador de criador, só o nome em texto livre — sem vínculo confiável ao catálogo de criadores.' : undefined}>
                    {text(x.creator)}
                  </td>
                  <td>{compact(x.views)}</td>
                  <td title={engagementRate === null ? TOOLTIP_NOT_IN_API : undefined}>
                    {engagementRate === null ? 'Não informado' : `${engagementRate.toFixed(1)}%`}
                  </td>
                  <td title={x.sales === null ? 'A API Bestsellers de vídeos não retorna vendas, pedidos ou unidades vendidas.' : undefined}>{compact(x.sales)}</td>
                  <td>{brl(x.gmv)}</td>
                  <td title={x.date === null ? TOOLTIP_NOT_IN_API : undefined}>{relativeDate(x.date)}</td>
                  <td title={x.growth === null ? TOOLTIP_NEEDS_HISTORY : undefined}>
                    {x.growth === null ? (
                      growthPct(x.growth)
                    ) : (
                      <span className={x.growth >= 0 ? 'growth' : 'negative'}>
                        {x.growth >= 0 ? '↗' : '↘'} {x.growth}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
