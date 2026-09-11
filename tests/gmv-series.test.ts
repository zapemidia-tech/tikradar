import { describe, it, expect } from 'vitest';
import { aggregateDailyGmv } from '@/lib/tiktok/gmv-series';

describe('aggregateDailyGmv', () => {
  it('soma o GMV real por dia, em ordem cronológica', () => {
    const products = [
      { history: [{ date: '2026-09-02', gmv: 100 }, { date: '2026-09-01', gmv: 40 }] },
      { history: [{ date: '2026-09-01', gmv: 10 }] },
    ];
    expect(aggregateDailyGmv(products)).toEqual([
      { date: '2026-09-01', gmv: 50 },
      { date: '2026-09-02', gmv: 100 },
    ]);
  });

  it('ignora pontos sem GMV em vez de somar como zero enganosamente', () => {
    const products = [{ history: [{ date: '2026-09-01', gmv: null }] }];
    expect(aggregateDailyGmv(products)).toEqual([]);
  });

  it('sem produtos, retorna série vazia', () => {
    expect(aggregateDailyGmv([])).toEqual([]);
  });
});
