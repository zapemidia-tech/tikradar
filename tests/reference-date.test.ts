import { describe, it, expect, vi } from 'vitest';
import {
  computeReferenceDate,
  extractMaxAllowedDate,
  formatReferenceDateForDisplay,
  timeZoneForRegion,
  withDateFallback,
} from '@/lib/tiktok/reference-date';

describe('computeReferenceDate', () => {
  it('usa 2 dias atrás por padrão', () => {
    const now = new Date('2026-09-12T15:00:00Z');
    expect(computeReferenceDate(now, 'UTC', 2)).toBe('2026-09-10');
  });

  it('considera o fuso da região, não o horário do servidor em UTC', () => {
    // 00:30 UTC de 12/set já é 11/set na noite anterior em São Paulo (UTC-3).
    const now = new Date('2026-09-12T00:30:00Z');
    expect(computeReferenceDate(now, 'America/Sao_Paulo', 2)).toBe('2026-09-09');
    expect(computeReferenceDate(now, 'UTC', 2)).toBe('2026-09-10');
  });

  it('vira o mês corretamente', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    expect(computeReferenceDate(now, 'UTC', 2)).toBe('2026-02-27');
  });

  it('vira o ano corretamente', () => {
    const now = new Date('2027-01-01T12:00:00Z');
    expect(computeReferenceDate(now, 'UTC', 2)).toBe('2026-12-30');
  });
});

describe('timeZoneForRegion', () => {
  it('mapeia regiões conhecidas', () => {
    expect(timeZoneForRegion('BR')).toBe('America/Sao_Paulo');
    expect(timeZoneForRegion('br')).toBe('America/Sao_Paulo');
  });

  it('cai em UTC para região desconhecida ou ausente, sem travar', () => {
    expect(timeZoneForRegion('XX')).toBe('UTC');
    expect(timeZoneForRegion(undefined)).toBe('UTC');
    expect(timeZoneForRegion(null)).toBe('UTC');
  });
});

describe('extractMaxAllowedDate', () => {
  it('extrai a data máxima da mensagem real da TikTok', () => {
    const message = 'Invalid Parameter. Parameter date received 2026-09-11, but date must be on or before 2026-09-10.';
    expect(extractMaxAllowedDate(message)).toBe('2026-09-10');
  });

  it('é insensível a maiúsculas/minúsculas', () => {
    expect(extractMaxAllowedDate('date MUST BE ON OR BEFORE 2026-01-05')).toBe('2026-01-05');
  });

  it('retorna null com segurança quando não há data válida na mensagem', () => {
    expect(extractMaxAllowedDate('Invalid Parameter.')).toBeNull();
    expect(extractMaxAllowedDate('')).toBeNull();
    expect(extractMaxAllowedDate(null)).toBeNull();
    expect(extractMaxAllowedDate(undefined)).toBeNull();
  });

  it('não aceita uma data com formato inválido mesmo que pareça uma data', () => {
    expect(extractMaxAllowedDate('date must be on or before 2026-13-40')).toBeNull();
  });
});

describe('formatReferenceDateForDisplay', () => {
  it('converte YYYY-MM-DD para DD/MM/AAAA', () => {
    expect(formatReferenceDateForDisplay('2026-09-10')).toBe('10/09/2026');
  });
});

describe('withDateFallback', () => {
  it('usa a data inicial quando a chamada funciona de primeira', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    const { result, dateUsed, corrected } = await withDateFallback('2026-09-11', run);
    expect(result).toBe('ok');
    expect(dateUsed).toBe('2026-09-11');
    expect(corrected).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('2026-09-11');
  });

  it('repete exatamente uma vez com a data máxima extraída da mensagem de erro', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('Invalid Parameter. Parameter date received 2026-09-11, but date must be on or before 2026-09-10.'))
      .mockResolvedValueOnce('ok-na-segunda-tentativa');

    const { result, dateUsed, corrected } = await withDateFallback('2026-09-11', run);
    expect(result).toBe('ok-na-segunda-tentativa');
    expect(dateUsed).toBe('2026-09-10');
    expect(corrected).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(2, '2026-09-10');
  });

  it('nunca tenta uma terceira vez: se a repetição também falhar, propaga o erro', async () => {
    const secondError = new Error('date must be on or before 2026-09-09');
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('date must be on or before 2026-09-10'))
      .mockRejectedValueOnce(secondError);

    await expect(withDateFallback('2026-09-11', run)).rejects.toBe(secondError);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('propaga o erro original sem repetir quando a resposta não traz uma data válida', async () => {
    const original = new Error('Rate limit exceeded.');
    const run = vi.fn().mockRejectedValueOnce(original);

    await expect(withDateFallback('2026-09-11', run)).rejects.toBe(original);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('não repete quando a data extraída é igual à data que já foi usada', async () => {
    const original = new Error('date must be on or before 2026-09-11');
    const run = vi.fn().mockRejectedValueOnce(original);

    await expect(withDateFallback('2026-09-11', run)).rejects.toBe(original);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
