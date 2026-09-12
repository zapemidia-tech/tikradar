import { describe, it, expect } from 'vitest';
import { isWithinLastDays, classifyGmvTier, checkGmvReliability, GMV_TIERS, NEW_IN_RADAR_MIN_GMV } from '@/lib/scoring/new-in-radar';

describe('isWithinLastDays — primeira detecção nos últimos 7 dias', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('detectado agora mesmo conta', () => {
    expect(isWithinLastDays('2026-09-12T12:00:00.000Z', 7, now)).toBe(true);
  });

  it('detectado há exatamente 7 dias (limite inclusivo) conta', () => {
    expect(isWithinLastDays('2026-09-05T12:00:00.000Z', 7, now)).toBe(true);
  });

  it('detectado há 7 dias e 1 segundo NÃO conta', () => {
    expect(isWithinLastDays('2026-09-05T11:59:59.000Z', 7, now)).toBe(false);
  });

  it('detectado há 6 dias e 23h59 conta', () => {
    expect(isWithinLastDays('2026-09-05T12:00:01.000Z', 7, now)).toBe(true);
  });

  it('virada de dia/fuso: 23:59 UTC de um dia até 00:01 UTC 7 dias depois não é afetada por calendário local', () => {
    // Diferença real: 7 dias e 2 minutos — deve ficar de fora mesmo que,
    // num calendário LOCAL (ex.: horário de Brasília, UTC-3), as duas datas
    // caiam em "dias de calendário" que pareçam a mesma distância. A conta
    // é sempre por milissegundos reais, nunca por data de calendário.
    const detectedAt = '2026-09-05T23:59:00.000Z';
    const later = new Date('2026-09-13T00:01:00.000Z');
    expect(isWithinLastDays(detectedAt, 7, later)).toBe(false);
  });

  it('data no futuro (relógio adiantado) nunca conta como recente', () => {
    expect(isWithinLastDays('2026-09-13T00:00:00.000Z', 7, now)).toBe(false);
  });

  it('ISO inválido nunca conta', () => {
    expect(isWithinLastDays('não é uma data', 7, now)).toBe(false);
  });
});

describe('classifyGmvTier — limites exatos das faixas (pelo limite inferior)', () => {
  it('abaixo de R$ 10 mil não entra em nenhuma faixa', () => {
    expect(classifyGmvTier(9_999.99)).toBeNull();
    expect(classifyGmvTier(0)).toBeNull();
    expect(classifyGmvTier(null)).toBeNull();
    expect(classifyGmvTier(undefined)).toBeNull();
    expect(classifyGmvTier(NaN)).toBeNull();
  });

  it('R$ 10 mil exatos entram na faixa 1, nunca na faixa 2', () => {
    expect(classifyGmvTier(10_000)).toBe(1);
  });

  it('logo abaixo de R$ 20 mil ainda é faixa 1', () => {
    expect(classifyGmvTier(19_999.99)).toBe(1);
  });

  it('R$ 20 mil exatos entram na faixa 2, nunca na faixa 1', () => {
    expect(classifyGmvTier(20_000)).toBe(2);
  });

  it('logo abaixo de R$ 50 mil ainda é faixa 2', () => {
    expect(classifyGmvTier(49_999.99)).toBe(2);
  });

  it('R$ 50 mil exatos entram na faixa 3, nunca na faixa 2', () => {
    expect(classifyGmvTier(50_000)).toBe(3);
  });

  it('logo abaixo de R$ 100 mil ainda é faixa 3', () => {
    expect(classifyGmvTier(99_999.99)).toBe(3);
  });

  it('R$ 100 mil exatos entram na faixa 4, nunca na faixa 3', () => {
    expect(classifyGmvTier(100_000)).toBe(4);
  });

  it('valores bem acima de R$ 100 mil continuam na faixa 4', () => {
    expect(classifyGmvTier(5_000_000)).toBe(4);
  });

  it('as 4 faixas nunca se sobrepõem (nenhum valor cai em duas)', () => {
    const boundaries = [10_000, 19_999.99, 20_000, 49_999.99, 50_000, 99_999.99, 100_000, 1_000_000];
    const seen = new Set(boundaries.map(classifyGmvTier));
    expect(seen.has(null)).toBe(false);
    expect(GMV_TIERS.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });

  it('NEW_IN_RADAR_MIN_GMV é o piso da faixa 1', () => {
    expect(NEW_IN_RADAR_MIN_GMV).toBe(10_000);
  });
});

describe('checkGmvReliability — só confia em período 7D + moeda BRL + faixa consistente', () => {
  const goodPayload = { gmv_range: 'BRL10000.00~BRL15000.00' };

  it('aceita um snapshot 7D/BRL com gmv_min/gmv_max batendo com o raw_payload', () => {
    expect(checkGmvReliability({ period: '7D', rawPayload: goodPayload, gmvMin: 10000, gmvMax: 15000 })).toEqual({ ok: true });
  });

  it('rejeita período diferente de 7D (ex.: 1D ou 30D)', () => {
    const result = checkGmvReliability({ period: '1D', rawPayload: goodPayload, gmvMin: 10000, gmvMax: 15000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('7D');
  });

  it('rejeita gmv_min/gmv_max ausentes', () => {
    expect(checkGmvReliability({ period: '7D', rawPayload: goodPayload, gmvMin: null, gmvMax: 15000 }).ok).toBe(false);
    expect(checkGmvReliability({ period: '7D', rawPayload: goodPayload, gmvMin: 10000, gmvMax: null }).ok).toBe(false);
  });

  it('rejeita faixa invertida (max < min)', () => {
    expect(checkGmvReliability({ period: '7D', rawPayload: goodPayload, gmvMin: 15000, gmvMax: 10000 }).ok).toBe(false);
  });

  it('rejeita quando o raw_payload não tem gmv_range em string (moeda não verificável)', () => {
    expect(checkGmvReliability({ period: '7D', rawPayload: { gmv_range: { min: 10000, max: 15000 } }, gmvMin: 10000, gmvMax: 15000 }).ok).toBe(false);
    expect(checkGmvReliability({ period: '7D', rawPayload: null, gmvMin: 10000, gmvMax: 15000 }).ok).toBe(false);
  });

  it('rejeita moeda diferente de BRL', () => {
    const result = checkGmvReliability({ period: '7D', rawPayload: { gmv_range: 'USD10000.00~USD15000.00' }, gmvMin: 10000, gmvMax: 15000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('BRL');
  });

  it('rejeita moeda divergente entre os dois lados da faixa', () => {
    expect(checkGmvReliability({ period: '7D', rawPayload: { gmv_range: 'BRL10000.00~USD15000.00' }, gmvMin: 10000, gmvMax: 15000 }).ok).toBe(false);
  });

  it('rejeita quando gmv_min/gmv_max gravados não batem com o gmv_range bruto (drift de parsing)', () => {
    const result = checkGmvReliability({ period: '7D', rawPayload: goodPayload, gmvMin: 10000, gmvMax: 99999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('não batem');
  });

  it('tolera diferença de arredondamento pequena (centavos)', () => {
    expect(checkGmvReliability({ period: '7D', rawPayload: goodPayload, gmvMin: 10000.001, gmvMax: 15000 }).ok).toBe(true);
  });
});
