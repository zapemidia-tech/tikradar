import { describe, it, expect } from 'vitest';
import { calculateEstimatedSales } from '@/lib/scoring/estimated-sales';

describe('calculateEstimatedSales — GMV ÷ preço, nunca um dado oficial', () => {
  it('null quando falta preço (caso real hoje: nenhum produto sincronizado tem price)', () => {
    expect(calculateEstimatedSales(850_000, null)).toBeNull();
  });

  it('null quando falta GMV', () => {
    expect(calculateEstimatedSales(null, 49.9)).toBeNull();
  });

  it('null quando preço é zero ou negativo (divisão inválida)', () => {
    expect(calculateEstimatedSales(1000, 0)).toBeNull();
    expect(calculateEstimatedSales(1000, -10)).toBeNull();
  });

  it('divide GMV pelo preço e arredonda para unidade inteira', () => {
    expect(calculateEstimatedSales(1000, 50)).toBe(20);
    expect(calculateEstimatedSales(999, 50)).toBe(20); // 19.98 -> 20
  });

  it('não confunde GMV com quantidade: valores muito diferentes', () => {
    const gmv = 852_958.09; // exemplo real de gmv_estimated observado
    const price = 199.9;
    expect(calculateEstimatedSales(gmv, price)).toBe(Math.round(gmv / price));
    expect(calculateEstimatedSales(gmv, price)).not.toBe(gmv);
  });
});
