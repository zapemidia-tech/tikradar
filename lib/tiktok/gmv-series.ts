// Agrega o GMV de todos os produtos por data de captura, a partir do
// histórico real de snapshots (não inventa pontos: se só existe uma data de
// captura até agora, a série tem um único ponto — cabe à UI decidir mostrar
// um estado de "histórico insuficiente" em vez de um gráfico vazio/enganoso).
export interface GmvSeriesPoint {
  date: string;
  gmv: number;
}

export function aggregateDailyGmv(products: readonly { history: readonly { date: string; gmv: number | null }[] }[]): GmvSeriesPoint[] {
  const totals = new Map<string, number>();
  for (const product of products) {
    for (const point of product.history) {
      if (point.gmv === null) continue;
      totals.set(point.date, (totals.get(point.date) ?? 0) + point.gmv);
    }
  }
  return [...totals.entries()].map(([date, gmv]) => ({ date, gmv })).sort((a, b) => a.date.localeCompare(b.date));
}
