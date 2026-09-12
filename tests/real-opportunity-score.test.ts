import { describe, it, expect } from 'vitest';
import {
  calculateRealOpportunityScore,
  calculateSaturationProxy,
  MIN_FACTORS_REQUIRED,
  OPPORTUNITY_WEIGHTS,
} from '@/lib/scoring/real-opportunity-score';

const empty = { gmvGrowth7d: null, rankingVelocity: null, gmvVolume: null, creatorsCount: null, videosCount: null, rating: null, momentum: null };

describe('calculateRealOpportunityScore', () => {
  it('retorna null com menos que MIN_FACTORS_REQUIRED fatores disponíveis', () => {
    expect(MIN_FACTORS_REQUIRED).toBeGreaterThan(0);
    expect(calculateRealOpportunityScore({ ...empty })).toBeNull();
    expect(calculateRealOpportunityScore({ ...empty, rating: 4.5 })).toBeNull();
  });

  it('calcula um score 0–100 quando há fatores suficientes', () => {
    const result = calculateRealOpportunityScore({
      ...empty,
      gmvGrowth7d: 40,
      rankingVelocity: 3,
      rating: 4.8,
    });
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(result!.factors.map((f) => f.key).sort()).toEqual(['gmvGrowth7d', 'rankingVelocity', 'rating'].sort());
  });

  it('nunca transforma um fator ausente em zero: mais fatores presentes não penaliza o score quando todos são bons', () => {
    const partial = calculateRealOpportunityScore({ ...empty, gmvGrowth7d: 50, rankingVelocity: 5, rating: 5 })!;
    const complete = calculateRealOpportunityScore({
      ...empty,
      gmvGrowth7d: 50,
      rankingVelocity: 5,
      rating: 5,
      gmvVolume: 2_000_000,
      creatorsCount: 100,
      videosCount: 300,
      momentum: 5,
    })!;
    // Ambos fortes em todos os fatores presentes -> scores próximos, nenhum
    // fator ausente derrubou a média (o que aconteceria se virasse zero).
    expect(Math.abs(partial.score - complete.score)).toBeLessThan(15);
  });

  it('inclui o fator de saturação com peso invertido (mais oferta de criadores/vídeos = fator de saturação pior)', () => {
    const low = calculateRealOpportunityScore({ ...empty, gmvGrowth7d: 10, rating: 4, creatorsCount: 5, videosCount: 10 })!;
    const high = calculateRealOpportunityScore({ ...empty, gmvGrowth7d: 10, rating: 4, creatorsCount: 500, videosCount: 2000 })!;
    const saturationFactor = (r: typeof low) => r.factors.find((f) => f.key === 'saturation')!;
    expect(saturationFactor(low).normalizedValue).toBeGreaterThan(saturationFactor(high).normalizedValue);
    expect(low.saturationScore).not.toBeNull();
    expect(low.saturationScore!).toBeLessThan(high.saturationScore!);
  });

  it('os pesos documentados somam 100', () => {
    const total = Object.values(OPPORTUNITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe('calculateSaturationProxy', () => {
  it('null sem nenhum dado de criadores/vídeos', () => {
    expect(calculateSaturationProxy(null, null)).toBeNull();
  });

  it('cresce com mais criadores/vídeos (mais oferta = mais saturado)', () => {
    const low = calculateSaturationProxy(5, 10)!;
    const high = calculateSaturationProxy(300, 800)!;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});
