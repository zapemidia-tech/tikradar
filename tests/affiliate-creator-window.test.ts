import { describe, it, expect } from 'vitest';
import { defaultAffiliateOrdersWindow, resolveAffiliateOrdersWindow, AFFILIATE_ORDERS_MAX_RANGE_DAYS } from '@/lib/tiktok/affiliate-creator-window';

const now = new Date('2026-09-30T12:00:00Z');
const nowSeconds = Math.floor(now.getTime() / 1000);

describe('defaultAffiliateOrdersWindow', () => {
  it('janela padrão de 7 dias termina em "agora", nunca no futuro', () => {
    const w = defaultAffiliateOrdersWindow(now);
    expect(w.createTimeLt).toBe(nowSeconds);
    expect(w.createTimeGe).toBe(nowSeconds - 7 * 86400);
  });
});

describe('resolveAffiliateOrdersWindow — período customizado', () => {
  it('aceita um período válido', () => {
    const result = resolveAffiliateOrdersWindow({ createTimeGe: nowSeconds - 86400, createTimeLt: nowSeconds }, now);
    expect(result).toEqual({ ok: true, window: { createTimeGe: nowSeconds - 86400, createTimeLt: nowSeconds } });
  });

  it('rejeita timestamps inválidos (não finito, zero, negativo)', () => {
    expect(resolveAffiliateOrdersWindow({ createTimeGe: NaN, createTimeLt: nowSeconds }, now)).toEqual({ ok: false, error: 'invalid_timestamps' });
    expect(resolveAffiliateOrdersWindow({ createTimeGe: 0, createTimeLt: nowSeconds }, now)).toEqual({ ok: false, error: 'invalid_timestamps' });
    expect(resolveAffiliateOrdersWindow({ createTimeGe: -100, createTimeLt: nowSeconds }, now)).toEqual({ ok: false, error: 'invalid_timestamps' });
  });

  it('rejeita início >= fim', () => {
    expect(resolveAffiliateOrdersWindow({ createTimeGe: nowSeconds, createTimeLt: nowSeconds }, now)).toEqual({ ok: false, error: 'start_after_end' });
    expect(resolveAffiliateOrdersWindow({ createTimeGe: nowSeconds + 10, createTimeLt: nowSeconds }, now)).toEqual({ ok: false, error: 'start_after_end' });
  });

  it('rejeita fim no futuro — nunca pede dados que ainda não existem', () => {
    expect(resolveAffiliateOrdersWindow({ createTimeGe: nowSeconds - 86400, createTimeLt: nowSeconds + 3600 }, now)).toEqual({ ok: false, error: 'future_period' });
  });

  it('aceita fim exatamente "agora" — não rejeita por 1s a menos do necessário', () => {
    const result = resolveAffiliateOrdersWindow({ createTimeGe: nowSeconds - 86400, createTimeLt: nowSeconds }, now);
    expect(result.ok).toBe(true);
  });

  it(`rejeita amplitude maior que o limite de segurança (${AFFILIATE_ORDERS_MAX_RANGE_DAYS} dias — nosso, não documentado pela TikTok pra este endpoint)`, () => {
    const result = resolveAffiliateOrdersWindow({ createTimeGe: nowSeconds - 400 * 86400, createTimeLt: nowSeconds }, now);
    expect(result).toEqual({ ok: false, error: 'range_too_wide' });
  });

  it('amplitude exatamente no limite é aceita', () => {
    const result = resolveAffiliateOrdersWindow({ createTimeGe: nowSeconds - AFFILIATE_ORDERS_MAX_RANGE_DAYS * 86400, createTimeLt: nowSeconds }, now);
    expect(result.ok).toBe(true);
  });

  it('respeita maxRangeDays customizado', () => {
    const result = resolveAffiliateOrdersWindow({ createTimeGe: nowSeconds - 60 * 86400, createTimeLt: nowSeconds }, now, 30);
    expect(result).toEqual({ ok: false, error: 'range_too_wide' });
  });
});
