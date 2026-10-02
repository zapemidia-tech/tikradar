// Período consultado em Search Creator Affiliate Orders — diferente das
// APIs de Shop Analytics (que usam `start_date_ge`/`end_date_lt` em
// YYYY-MM-DD), aqui são `create_time_ge`/`create_time_lt` em UNIX TIMESTAMP
// (segundos), confirmado na doc oficial.
//
// A doc oficial NÃO documenta um limite máximo de amplitude pra esta API
// (diferente da Shop Analytics 202605, que documenta 180-365 dias) —
// `AFFILIATE_ORDERS_MAX_RANGE_DAYS` abaixo é uma precaução NOSSA, não um
// limite oficial da TikTok. Nunca apresentado na UI como "o limite da
// TikTok" — só como uma faixa seguramente dentro do que qualquer API real
// aceitaria, pra nunca arriscar virar uma varredura completa do histórico.
export const AFFILIATE_ORDERS_MAX_RANGE_DAYS = 180;

export interface AffiliateOrdersWindow {
  createTimeGe: number;
  createTimeLt: number;
}

export function defaultAffiliateOrdersWindow(now: Date = new Date(), spanDays = 7): AffiliateOrdersWindow {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return { createTimeGe: nowSeconds - spanDays * 86400, createTimeLt: nowSeconds };
}

export const AFFILIATE_ORDERS_PERIOD_PRESETS = [
  { spanDays: 7, label: '7 dias' },
  { spanDays: 14, label: '14 dias' },
  { spanDays: 30, label: '30 dias' },
  { spanDays: 90, label: '90 dias' },
] as const;

export type AffiliateOrdersWindowValidationError = 'invalid_timestamps' | 'start_after_end' | 'range_too_wide' | 'future_period';

/**
 * Valida um período customizado pedido pelo usuário. Nunca "corrige"
 * silenciosamente — só aceita ou rejeita, com o motivo exato.
 */
export function resolveAffiliateOrdersWindow(
  input: { createTimeGe: number; createTimeLt: number },
  now: Date = new Date(),
  maxRangeDays: number = AFFILIATE_ORDERS_MAX_RANGE_DAYS,
): { ok: true; window: AffiliateOrdersWindow } | { ok: false; error: AffiliateOrdersWindowValidationError } {
  if (!Number.isFinite(input.createTimeGe) || !Number.isFinite(input.createTimeLt) || input.createTimeGe <= 0 || input.createTimeLt <= 0) {
    return { ok: false, error: 'invalid_timestamps' };
  }
  if (input.createTimeGe >= input.createTimeLt) return { ok: false, error: 'start_after_end' };
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (input.createTimeLt > nowSeconds) return { ok: false, error: 'future_period' };
  const spanDays = (input.createTimeLt - input.createTimeGe) / 86400;
  if (spanDays > maxRangeDays) return { ok: false, error: 'range_too_wide' };
  return { ok: true, window: { createTimeGe: input.createTimeGe, createTimeLt: input.createTimeLt } };
}
