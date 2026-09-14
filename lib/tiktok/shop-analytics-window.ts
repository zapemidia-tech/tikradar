import { computeReferenceDate, isValidIsoDate } from './reference-date';

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

// Presets de período pro seletor de "Minha loja" — em dias de amplitude
// (`spanDays` de defaultAnalyticsWindow). 7 é o padrão (mesma janela já
// usada no diagnóstico). Nenhum preset chega perto do limite de 180/365
// dias documentado (ver SHOP_DASHBOARD_MAX_RANGE_DAYS) — são só atalhos de
// UI; o usuário ainda pode digitar um período customizado, sempre validado
// por `resolveRequestedAnalyticsWindow`.
export const SHOP_DASHBOARD_PERIOD_PRESETS = [
  { spanDays: 7, label: '7 dias' },
  { spanDays: 14, label: '14 dias' },
  { spanDays: 30, label: '30 dias' },
  { spanDays: 90, label: '90 dias' },
] as const;

// Menor dos dois limites que a changelog oficial da 202605 documenta ("The
// maximum query range is 180–365 days depending on the API") — usado pros
// dois endpoints (vídeo e produto) porque a doc de cada um não repete o
// número exato, só a changelog dá a faixa; usar o menor nunca arrisca
// estourar o limite real de nenhum dos dois endpoints.
export const SHOP_DASHBOARD_MAX_RANGE_DAYS = 180;

export type AnalyticsWindowValidationError = 'invalid_dates' | 'start_after_end' | 'range_too_wide' | 'includes_unavailable_period';

/**
 * Valida um período pedido pelo usuário (seletor customizado de "Minha
 * loja") contra as mesmas regras que `defaultAnalyticsWindow` já aplica por
 * padrão: formato `YYYY-MM-DD`, início antes do fim, amplitude dentro do
 * limite documentado, e nunca incluindo o período ainda não processado pela
 * TikTok (`endDateLt` não pode passar de hoje−`lagDays`, no fuso da loja).
 * Nunca "corrige" silenciosamente uma data inválida — só aceita ou rejeita,
 * com o motivo exato, pra UI explicar em vez de mostrar um período errado.
 */
export function resolveRequestedAnalyticsWindow(
  input: { startDateGe: string; endDateLt: string },
  now: Date,
  timeZone: string,
  opts: { lagDays?: number; maxRangeDays?: number } = {},
): { ok: true; window: AnalyticsWindow } | { ok: false; error: AnalyticsWindowValidationError } {
  const lagDays = opts.lagDays ?? 2;
  const maxRangeDays = opts.maxRangeDays ?? SHOP_DASHBOARD_MAX_RANGE_DAYS;

  if (!isValidIsoDate(input.startDateGe) || !isValidIsoDate(input.endDateLt)) return { ok: false, error: 'invalid_dates' };
  if (input.startDateGe >= input.endDateLt) return { ok: false, error: 'start_after_end' }; // strings YYYY-MM-DD comparam lexicograficamente = comparam por data

  const latestAllowedEnd = computeReferenceDate(now, timeZone, lagDays);
  if (input.endDateLt > latestAllowedEnd) return { ok: false, error: 'includes_unavailable_period' };

  const spanDays = Math.round((new Date(`${input.endDateLt}T00:00:00Z`).getTime() - new Date(`${input.startDateGe}T00:00:00Z`).getTime()) / 86_400_000);
  if (spanDays > maxRangeDays) return { ok: false, error: 'range_too_wide' };

  return { ok: true, window: { startDateGe: input.startDateGe, endDateLt: input.endDateLt } };
}
