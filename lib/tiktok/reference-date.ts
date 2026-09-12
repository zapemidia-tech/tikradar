// Data de referência (`date`) enviada aos endpoints Bestsellers da TikTok
// Shop. Centralizado aqui para produtos, criadores, vídeos e lives usarem
// exatamente a mesma regra (services/tiktok/bestsellers-service.ts é o
// único chamador).
//
// A TikTok tem atraso no processamento dos dados: "ontem" nem sempre está
// disponível ainda. Por isso:
//   1. a tentativa inicial usa 2 dias atrás, no fuso da REGIÃO da loja (não
//      o horário do servidor em UTC — perto da virada do dia UTC, "ontem"
//      em UTC pode não ser "ontem" em São Paulo, por exemplo);
//   2. se a TikTok responder com a data máxima aceita, extraímos essa data
//      da mensagem com segurança (nunca usamos texto não validado como
//      parâmetro) e repetimos a chamada UMA única vez com ela.

/** Fusos conhecidos por região da loja TikTok Shop. Região não mapeada cai em UTC (documentado, nunca assumido às cegas). */
const REGION_TIME_ZONES: Record<string, string> = {
  BR: 'America/Sao_Paulo',
  US: 'America/New_York',
  MX: 'America/Mexico_City',
  GB: 'Europe/London',
  ID: 'Asia/Jakarta',
  VN: 'Asia/Ho_Chi_Minh',
  TH: 'Asia/Bangkok',
  MY: 'Asia/Kuala_Lumpur',
  PH: 'Asia/Manila',
  SG: 'Asia/Singapore',
};

export function timeZoneForRegion(region: string | undefined | null): string {
  if (!region) return 'UTC';
  return REGION_TIME_ZONES[region.toUpperCase()] ?? 'UTC';
}

function partsInTimeZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Data de referência (`YYYY-MM-DD`) `daysAgo` dias antes de `now`, calculada
 * no calendário local do fuso informado — não em UTC. Usa aritmética de
 * `Date` (via meia-noite UTC representando o dia local) para virar mês/ano
 * corretamente.
 */
export function computeReferenceDate(now: Date, timeZone: string, daysAgo: number): string {
  const { year, month, day } = partsInTimeZone(now, timeZone);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() - daysAgo);
  return toIsoDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Extrai com segurança a data máxima aceita a partir de uma mensagem de
 * erro da TikTok Shop (ex.: "...date must be on or before 2026-09-10.").
 * Retorna `null` — nunca lança — quando a mensagem não tem uma data válida
 * nesse formato, para nunca usar texto não confiável como parâmetro.
 */
export function extractMaxAllowedDate(message: string | null | undefined): string | null {
  if (!message) return null;
  const match = message.match(/on or before\s+(\d{4}-\d{2}-\d{2})/i);
  if (!match) return null;
  return isValidIsoDate(match[1]) ? match[1] : null;
}

/** `YYYY-MM-DD` -> `DD/MM/AAAA`, para exibição. */
export function formatReferenceDateForDisplay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export interface DateFallbackResult<T> {
  result: T;
  dateUsed: string;
  /** `true` quando foi necessário repetir a chamada com a data corrigida pela TikTok. */
  corrected: boolean;
}

/**
 * Executa `run(date)` com `initialDate`. Se falhar com uma mensagem que
 * traga a data máxima aceita, repete `run` UMA única vez com essa data —
 * nunca mais que isso, mesmo que a repetição também falhe (o erro da
 * repetição é propagado normalmente, sem novas tentativas).
 */
export async function withDateFallback<T>(initialDate: string, run: (date: string) => Promise<T>): Promise<DateFallbackResult<T>> {
  try {
    const result = await run(initialDate);
    return { result, dateUsed: initialDate, corrected: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null;
    const maxDate = extractMaxAllowedDate(message);
    if (!maxDate || maxDate === initialDate) throw error;
    const result = await run(maxDate); // única repetição — se falhar, propaga sem tentar de novo
    return { result, dateUsed: maxDate, corrected: true };
  }
}
