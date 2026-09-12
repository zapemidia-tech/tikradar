import { describe, it, expect } from 'vitest';
import { groupSnapshotsByEntity, growthBetween } from '@/lib/tiktok/snapshot-reduce';

type Row = { capturedAt: string; productId: string; sales: number };

describe('groupSnapshotsByEntity', () => {
  it('usa o snapshot mais recente por entidade, mesmo fora de ordem', () => {
    const rows: Row[] = [
      { capturedAt: '2026-09-01T00:00:00Z', productId: 'p1', sales: 10 },
      { capturedAt: '2026-09-03T00:00:00Z', productId: 'p1', sales: 30 },
      { capturedAt: '2026-09-02T00:00:00Z', productId: 'p1', sales: 20 },
    ];
    const grouped = groupSnapshotsByEntity(rows, (r) => r.productId);
    expect(grouped.get('p1')?.latest.sales).toBe(30);
    expect(grouped.get('p1')?.previous?.sales).toBe(20);
    expect(grouped.get('p1')?.series.map((r) => r.sales)).toEqual([10, 20, 30]);
  });

  it('previous é null com um único snapshot (sem inventar histórico)', () => {
    const rows: Row[] = [{ capturedAt: '2026-09-01T00:00:00Z', productId: 'p2', sales: 5 }];
    const grouped = groupSnapshotsByEntity(rows, (r) => r.productId);
    expect(grouped.get('p2')?.previous).toBeNull();
    expect(grouped.get('p2')?.series).toHaveLength(1);
  });

  it('mantém entidades separadas', () => {
    const rows: Row[] = [
      { capturedAt: '2026-09-01T00:00:00Z', productId: 'p1', sales: 1 },
      { capturedAt: '2026-09-01T00:00:00Z', productId: 'p2', sales: 2 },
    ];
    const grouped = groupSnapshotsByEntity(rows, (r) => r.productId);
    expect(grouped.size).toBe(2);
  });
});

describe('growthBetween', () => {
  it('calcula a variação percentual com 1 casa decimal', () => {
    expect(growthBetween(150, 100)).toBe(50);
    expect(growthBetween(90, 100)).toBe(-10);
  });

  it('retorna null quando falta um dos lados (não inventa 0%)', () => {
    expect(growthBetween(null, 100)).toBeNull();
    expect(growthBetween(100, undefined)).toBeNull();
    expect(growthBetween(null, null)).toBeNull();
  });

  it('nunca calcula quando o valor anterior é zero (mesmo 0->0 vira "dados insuficientes", não 0%)', () => {
    expect(growthBetween(50, 0)).toBeNull();
    expect(growthBetween(0, 0)).toBeNull();
  });
});
