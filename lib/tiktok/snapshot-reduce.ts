// Utilitários puros para transformar linhas de snapshot (product_snapshots,
// creator_snapshots, video_snapshots, live_snapshots) em "o mais recente por
// entidade" + a série completa (para gráficos) + o ponto anterior (para
// calcular crescimento real). Nada aqui toca em rede/Supabase — só reduz um
// array já carregado, o que torna a lógica testável sem banco.

export interface EntitySnapshotGroup<T> {
  /** Snapshot mais recente da entidade (requisito: "utilize o snapshot mais recente"). */
  latest: T;
  /** Penúltimo snapshot, se existir — usado para calcular crescimento real. */
  previous: T | null;
  /** Todos os snapshots da entidade, em ordem crescente de captura (para gráficos). */
  series: T[];
}

/** Agrupa linhas de snapshot por entidade e ordena cada grupo por data de captura. */
export function groupSnapshotsByEntity<T extends { capturedAt: string }>(
  rows: readonly T[],
  entityIdOf: (row: T) => string,
): Map<string, EntitySnapshotGroup<T>> {
  const byEntity = new Map<string, T[]>();
  for (const row of rows) {
    const id = entityIdOf(row);
    const list = byEntity.get(id);
    if (list) list.push(row);
    else byEntity.set(id, [row]);
  }

  const result = new Map<string, EntitySnapshotGroup<T>>();
  for (const [id, list] of byEntity) {
    const series = [...list].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
    const latest = series[series.length - 1];
    const previous = series.length >= 2 ? series[series.length - 2] : null;
    result.set(id, { latest, previous, series });
  }
  return result;
}

/**
 * Variação percentual entre dois valores reais (1 casa decimal).
 * `null` quando qualquer um dos lados é desconhecido, ou quando o valor
 * anterior é zero e o atual não é (taxa indefinida) — nunca inventa 0% nem
 * retorna Infinity.
 */
export function growthBetween(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
