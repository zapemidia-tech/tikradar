// Opportunity Score calculado somente a partir de sinais reais sincronizados
// do Supabase. Nenhum valor ausente vira zero: um fator ausente é excluído
// do cálculo e seu peso é redistribuído entre os fatores presentes (média
// ponderada normalizada), não somado como "pior caso". Se poucos fatores
// estiverem disponíveis, a função retorna `null` e a UI deve mostrar
// "Dados insuficientes" — nunca um número inventado.
//
// Os pesos e as referências de normalização abaixo são um critério do
// TikRadar (não vêm da TikTok Shop) — documentados aqui, centralizados e
// cobertos por teste, para poderem ser ajustados com uma mudança em um só
// lugar. As ENTRADAS de cada fator, por outro lado, são sempre reais:
// vêm de snapshots sincronizados, nunca de suposição.

/** Peso de cada fator (soma = 100 quando todos estão presentes). */
export const OPPORTUNITY_WEIGHTS = {
  gmvGrowth7d: 22, // crescimento real de GMV entre os 2 snapshots 7D mais recentes
  rankingVelocity: 18, // posições/dia que o produto subiu no ranking
  gmvVolume: 15, // volume absoluto de GMV (7D) — mercado grande importa, não só crescimento
  creatorsCount: 12, // quantidade de criadores promovendo o produto
  videosCount: 8, // quantidade de vídeos promovendo o produto
  rating: 10, // nota do produto (0–5)
  saturation: 8, // quanto mais criadores/vídeos já presentes, mais saturado (peso invertido)
  momentum: 7, // aceleração/desaceleração da velocidade de ranking
} as const;

/** Nº mínimo de fatores com dado real para tentar um score. Abaixo disso, "Dados insuficientes". */
export const MIN_FACTORS_REQUIRED = 3;

/** Referências de normalização (critério do TikRadar, documentado e ajustável aqui). */
export const GMV_VOLUME_REFERENCE = 1_000_000; // GMV (7D) considerado "alto volume"
export const CREATORS_REFERENCE = 150; // nº de criadores considerado "mercado saturado de criadores"
export const VIDEOS_REFERENCE = 400; // nº de vídeos considerado "mercado saturado de conteúdo"

export interface OpportunityFactorInput {
  /** % de crescimento do GMV estimado entre os 2 snapshots 7D mais recentes. null = sem histórico suficiente. */
  gmvGrowth7d: number | null;
  /** posições/dia (positivo = subindo no ranking). null = sem histórico suficiente. */
  rankingVelocity: number | null;
  /** GMV estimado (7D), em reais. */
  gmvVolume: number | null;
  /** nº de criadores promovendo o produto. */
  creatorsCount: number | null;
  /** nº de vídeos promovendo o produto. */
  videosCount: number | null;
  /** nota do produto (0–5). */
  rating: number | null;
  /** aceleração/desaceleração do ranking (ver lib/scoring/snapshot-analytics.ts). null = sem histórico suficiente. */
  momentum: number | null;
}

export interface OpportunityFactor {
  key: string;
  label: string;
  /** peso original do fator (0–100). */
  weight: number;
  /** valor bruto real usado. */
  rawValue: number;
  /** valor normalizado 0–100 usado no cálculo. */
  normalizedValue: number;
}

export interface OpportunityResult {
  score: number;
  /** saturação (0–100, quanto maior mais saturado) — salva em opportunity_scores.saturation_score. */
  saturationScore: number | null;
  factors: OpportunityFactor[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

function normalizeGrowth(pct: number): number {
  return clamp(50 + pct / 2);
}
function normalizeVelocity(v: number): number {
  return clamp(50 + v * 3);
}
function normalizeMomentum(v: number): number {
  return clamp(50 + v * 2);
}
function normalizeVolume(v: number, reference: number): number {
  return v <= 0 ? 0 : clamp((Math.log10(v + 1) / Math.log10(reference)) * 100);
}
function normalizeCount(v: number, reference: number): number {
  return clamp((v / reference) * 100);
}
function normalizeRating(v: number): number {
  return clamp((v / 5) * 100);
}

/**
 * Proxy de saturação (0–100, quanto maior mais saturado) a partir da
 * quantidade real de criadores e vídeos já promovendo o produto. Não há
 * fonte real de nº de vendedores concorrentes na API atual — por isso o
 * TikRadar usa oferta de conteúdo/criadores como aproximação, documentada
 * aqui em vez de um "índice de concorrência" inventado sem base.
 */
export function calculateSaturationProxy(creatorsCount: number | null, videosCount: number | null): number | null {
  const parts: number[] = [];
  if (creatorsCount !== null) parts.push(normalizeCount(creatorsCount, CREATORS_REFERENCE));
  if (videosCount !== null) parts.push(normalizeCount(videosCount, VIDEOS_REFERENCE));
  if (parts.length === 0) return null;
  return round1(parts.reduce((a, b) => a + b, 0) / parts.length);
}

const FACTOR_DEFS: {
  key: keyof OpportunityFactorInput;
  label: string;
  weight: number;
  normalize: (value: number) => number;
}[] = [
  { key: 'gmvGrowth7d', label: 'Crescimento de GMV (7d)', weight: OPPORTUNITY_WEIGHTS.gmvGrowth7d, normalize: normalizeGrowth },
  { key: 'rankingVelocity', label: 'Evolução no ranking', weight: OPPORTUNITY_WEIGHTS.rankingVelocity, normalize: normalizeVelocity },
  { key: 'gmvVolume', label: 'Volume de GMV', weight: OPPORTUNITY_WEIGHTS.gmvVolume, normalize: (v) => normalizeVolume(v, GMV_VOLUME_REFERENCE) },
  { key: 'creatorsCount', label: 'Quantidade de criadores', weight: OPPORTUNITY_WEIGHTS.creatorsCount, normalize: (v) => normalizeCount(v, CREATORS_REFERENCE) },
  { key: 'videosCount', label: 'Quantidade de vídeos', weight: OPPORTUNITY_WEIGHTS.videosCount, normalize: (v) => normalizeCount(v, VIDEOS_REFERENCE) },
  { key: 'rating', label: 'Avaliação', weight: OPPORTUNITY_WEIGHTS.rating, normalize: normalizeRating },
  { key: 'momentum', label: 'Momentum do ranking', weight: OPPORTUNITY_WEIGHTS.momentum, normalize: normalizeMomentum },
];

/**
 * Calcula o Opportunity Score (0–100) só com fatores realmente disponíveis.
 * Retorna `null` (→ "Dados insuficientes" na UI) quando menos de
 * `MIN_FACTORS_REQUIRED` fatores têm dado real.
 */
export function calculateRealOpportunityScore(input: OpportunityFactorInput): OpportunityResult | null {
  const factors: OpportunityFactor[] = [];
  for (const def of FACTOR_DEFS) {
    const raw = input[def.key];
    if (raw === null || raw === undefined) continue;
    factors.push({ key: def.key, label: def.label, weight: def.weight, rawValue: raw, normalizedValue: round1(def.normalize(raw)) });
  }

  const saturationScore = calculateSaturationProxy(input.creatorsCount, input.videosCount);
  if (saturationScore !== null) {
    factors.push({
      key: 'saturation',
      label: 'Saturação (invertida)',
      weight: OPPORTUNITY_WEIGHTS.saturation,
      rawValue: saturationScore,
      normalizedValue: round1(clamp(100 - saturationScore)),
    });
  }

  if (factors.length < MIN_FACTORS_REQUIRED) return null;

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weighted = factors.reduce((sum, f) => sum + f.normalizedValue * f.weight, 0) / totalWeight;

  return { score: Math.round(clamp(weighted)), saturationScore, factors };
}
