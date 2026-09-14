import { describe, it, expect } from 'vitest';
import { resolveRequestedAnalyticsWindow, SHOP_DASHBOARD_MAX_RANGE_DAYS } from '@/lib/tiktok/shop-analytics-window';

const now = new Date('2026-09-14T12:00:00Z');
const tz = 'America/Sao_Paulo';

describe('resolveRequestedAnalyticsWindow — período customizado de "Minha loja"', () => {
  it('aceita um período válido dentro do limite, antes do lag', () => {
    const result = resolveRequestedAnalyticsWindow({ startDateGe: '2026-09-01', endDateLt: '2026-09-10' }, now, tz);
    expect(result).toEqual({ ok: true, window: { startDateGe: '2026-09-01', endDateLt: '2026-09-10' } });
  });

  it('rejeita datas em formato inválido — nunca tenta "corrigir" silenciosamente', () => {
    expect(resolveRequestedAnalyticsWindow({ startDateGe: '01/09/2026', endDateLt: '2026-09-10' }, now, tz)).toEqual({ ok: false, error: 'invalid_dates' });
    expect(resolveRequestedAnalyticsWindow({ startDateGe: '2026-09-01', endDateLt: 'não é data' }, now, tz)).toEqual({ ok: false, error: 'invalid_dates' });
    expect(resolveRequestedAnalyticsWindow({ startDateGe: '2026-13-40', endDateLt: '2026-09-10' }, now, tz)).toEqual({ ok: false, error: 'invalid_dates' });
  });

  it('rejeita início >= fim', () => {
    expect(resolveRequestedAnalyticsWindow({ startDateGe: '2026-09-10', endDateLt: '2026-09-10' }, now, tz)).toEqual({ ok: false, error: 'start_after_end' });
    expect(resolveRequestedAnalyticsWindow({ startDateGe: '2026-09-11', endDateLt: '2026-09-10' }, now, tz)).toEqual({ ok: false, error: 'start_after_end' });
  });

  it('rejeita um fim de período que inclui dias ainda não processados pela TikTok (dentro do lag)', () => {
    // now=2026-09-14 em UTC; lagDays padrão=2 -> último fim aceito é 2026-09-12 (no fuso da loja)
    const result = resolveRequestedAnalyticsWindow({ startDateGe: '2026-09-01', endDateLt: '2026-09-14' }, now, tz);
    expect(result).toEqual({ ok: false, error: 'includes_unavailable_period' });
  });

  it('aceita exatamente o último dia permitido pelo lag — não rejeita por 1 dia a mais que o necessário', () => {
    const result = resolveRequestedAnalyticsWindow({ startDateGe: '2026-09-01', endDateLt: '2026-09-12' }, now, tz);
    expect(result.ok).toBe(true);
  });

  it('rejeita amplitude maior que o limite documentado — nunca busca um período maior do que a TikTok aceita', () => {
    const result = resolveRequestedAnalyticsWindow({ startDateGe: '2025-01-01', endDateLt: '2026-01-01' }, now, tz);
    expect(result).toEqual({ ok: false, error: 'range_too_wide' });
  });

  it(`amplitude exatamente no limite (${SHOP_DASHBOARD_MAX_RANGE_DAYS} dias) é aceita`, () => {
    // 2026-09-12 (fim máximo permitido pelo lag) menos 180 dias
    const result = resolveRequestedAnalyticsWindow({ startDateGe: '2026-03-16', endDateLt: '2026-09-12' }, now, tz);
    expect(result.ok).toBe(true);
  });

  it('respeita maxRangeDays customizado (defesa contra endpoint com limite menor no futuro)', () => {
    const result = resolveRequestedAnalyticsWindow({ startDateGe: '2026-08-01', endDateLt: '2026-09-10' }, now, tz, { maxRangeDays: 30 });
    expect(result).toEqual({ ok: false, error: 'range_too_wide' });
  });
});
