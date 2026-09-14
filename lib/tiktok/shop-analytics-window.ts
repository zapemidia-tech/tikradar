import { computeReferenceDate } from './reference-date';

// Janela padrão para consultar as APIs de performance da própria loja.
// `start_date_ge`/`end_date_lt` são obrigatórios nas duas (documentado) — sem
// uma janela de segurança, a 1ª chamada corre risco real de cair em
// `28001022` (data ainda não processada) se pedir até "hoje". Mesmo
// raciocínio de atraso já usado (e testado) para o Bestsellers em
// lib/tiktok/reference-date.ts — `lagDays` aqui é deliberadamente mais
// conservador (padrão 2 dias) porque, diferente do Bestsellers, a resposta
// destas duas APIs não veio de exemplo real desta conta ainda; nunca inclui
// o dia de hoje.
export interface AnalyticsWindow {
  startDateGe: string;
  endDateLt: string;
}

export function defaultAnalyticsWindow(now: Date, timeZone: string, opts: { lagDays?: number; spanDays?: number } = {}): AnalyticsWindow {
  const lagDays = opts.lagDays ?? 2;
  const spanDays = opts.spanDays ?? 7;
  return {
    endDateLt: computeReferenceDate(now, timeZone, lagDays),
    startDateGe: computeReferenceDate(now, timeZone, lagDays + spanDays),
  };
}
