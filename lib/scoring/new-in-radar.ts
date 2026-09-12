// Regras puras de "Novos no radar" — nada aqui toca em rede/Supabase, o que
// torna tudo testável sem banco (ver tests/new-in-radar.test.ts).
//
// Duas responsabilidades:
//   1. `isWithinLastDays` — critério de "detectado nos últimos N dias".
//   2. `checkGmvReliability` + `classifyGmvTier` — só classifica um produto
//      numa faixa de GMV quando período (7D), moeda (BRL) e faixa
//      (min <= max, ambos numéricos) são confiáveis; caso contrário retorna
//      um motivo (nunca lançado ao cliente — ver uso em
//      lib/providers/tiktok-shop-provider.ts, que só registra via
//      console.error no servidor).
import { parseGmvRangeString } from '@/services/tiktok/adapters';
import type { GmvTierId } from '@/types';

const EXPECTED_PERIOD = '7D';
const EXPECTED_CURRENCY = 'BRL';
// Tolerância a arredondamento entre o gmv_min/gmv_max já gravado (colunas
// numeric(14,2)) e o valor reanalisado agora a partir do raw_payload bruto.
const RANGE_TOLERANCE = 0.5;

/**
 * `true` quando `iso` está entre `now` e `now - days` (inclusive), usando
 * diferença de milissegundos — nunca corte de calendário/fuso horário, então
 * uma virada de dia ou de fuso não muda o resultado. `false` para uma data
 * no futuro (relógio de sincronização adiantado não deve contar como
 * "detectado recentemente").
 */
export function isWithinLastDays(iso: string, days: number, now: Date = new Date()): boolean {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return false;
  const diffMs = now.getTime() - then;
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

export interface GmvTierDef {
  id: GmvTierId;
  label: string;
  min: number;
  maxExclusive: number | null;
}

// Limites em BRL, pelo LIMITE INFERIOR do gmv_range — nunca duplicado entre
// faixas (cada valor de gmvMin cai em exatamente uma).
export const GMV_TIERS: readonly GmvTierDef[] = [
  { id: 1, label: 'R$ 10 mil a menos de R$ 20 mil', min: 10_000, maxExclusive: 20_000 },
  { id: 2, label: 'R$ 20 mil a menos de R$ 50 mil', min: 20_000, maxExclusive: 50_000 },
  { id: 3, label: 'R$ 50 mil a menos de R$ 100 mil', min: 50_000, maxExclusive: 100_000 },
  { id: 4, label: 'R$ 100 mil ou mais', min: 100_000, maxExclusive: null },
];

export const NEW_IN_RADAR_MIN_GMV = GMV_TIERS[0].min;

/** `null` quando `gmvMin` não qualifica (abaixo de R$ 10 mil) ou é inválido — nunca inventa uma faixa. */
export function classifyGmvTier(gmvMin: number | null | undefined): GmvTierId | null {
  if (gmvMin === null || gmvMin === undefined || !Number.isFinite(gmvMin) || gmvMin < NEW_IN_RADAR_MIN_GMV) return null;
  for (const tier of GMV_TIERS) {
    if (gmvMin >= tier.min && (tier.maxExclusive === null || gmvMin < tier.maxExclusive)) return tier.id;
  }
  return null;
}

export type GmvReliability = { ok: true } | { ok: false; reason: string };

function rawGmvRangeString(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const value = (rawPayload as Record<string, unknown>).gmv_range;
  return typeof value === 'string' ? value : null;
}

/**
 * Confirma, a partir do `raw_payload` real salvo no snapshot (não apenas
 * das colunas já calculadas), que o GMV usado é do período 7D, está em BRL
 * e a faixa é consistente — antes de deixar um produto entrar em "Novos no
 * radar". Qualquer inconsistência retorna `{ok:false, reason}` em vez de
 * lançar: quem chama decide o que fazer (aqui: excluir o produto e logar o
 * motivo só no servidor, nunca expor o raw_payload ao cliente).
 */
export function checkGmvReliability(input: {
  period: string;
  rawPayload: unknown;
  gmvMin: number | null;
  gmvMax: number | null;
}): GmvReliability {
  const { period, rawPayload, gmvMin, gmvMax } = input;

  if (period !== EXPECTED_PERIOD) {
    return { ok: false, reason: `período do snapshot é "${period}", esperado "${EXPECTED_PERIOD}"` };
  }
  if (gmvMin === null || gmvMax === null || !Number.isFinite(gmvMin) || !Number.isFinite(gmvMax)) {
    return { ok: false, reason: 'gmv_min/gmv_max ausente ou não numérico' };
  }
  if (gmvMin < 0 || gmvMax < gmvMin) {
    return { ok: false, reason: `faixa de GMV inconsistente (min=${gmvMin}, max=${gmvMax})` };
  }

  const rangeString = rawGmvRangeString(rawPayload);
  if (!rangeString) {
    return { ok: false, reason: 'raw_payload sem gmv_range em formato string — moeda não verificável' };
  }

  const parsed = parseGmvRangeString(rangeString);
  if (parsed.currency !== EXPECTED_CURRENCY) {
    return { ok: false, reason: `moeda do gmv_range é "${parsed.currency ?? 'desconhecida/divergente'}", esperado "${EXPECTED_CURRENCY}"` };
  }
  if (parsed.min === null || parsed.max === null) {
    return { ok: false, reason: 'não foi possível reanalisar o gmv_range bruto do raw_payload' };
  }
  if (Math.abs(parsed.min - gmvMin) > RANGE_TOLERANCE || Math.abs(parsed.max - gmvMax) > RANGE_TOLERANCE) {
    return {
      ok: false,
      reason: `gmv_min/gmv_max gravados (${gmvMin}~${gmvMax}) não batem com o gmv_range bruto reanalisado (${parsed.min}~${parsed.max})`,
    };
  }
  return { ok: true };
}
