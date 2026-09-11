// Formatação de números/moeda. Todas as funções aceitam valores ausentes
// (null/undefined) e retornam um texto explícito em vez de "R$ NaN", "0" ou
// travar — nunca inventamos um valor para um indicador que não veio da fonte.
export const NA = 'Não informado';

export const brl = (n: number | null | undefined) =>
  n === null || n === undefined
    ? NA
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: n > 99999 ? 'compact' : 'standard' }).format(n);

export const compact = (n: number | null | undefined) =>
  n === null || n === undefined ? NA : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Número inteiro simples (contagens: criadores, vídeos, produtos...). */
export const num = (n: number | null | undefined) => (n === null || n === undefined ? NA : String(n));

/** Percentual com sinal, usado em crescimento/variações. */
export const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? NA : `${n >= 0 ? '+' : ''}${n}%`;

/** Nota (0–5), uma casa decimal. */
export const rating = (n: number | null | undefined) => (n === null || n === undefined ? NA : n.toFixed(1));

/** Texto livre (nome de loja, categoria, username...). */
export const text = (s: string | null | undefined) => (s === null || s === undefined || s === '' ? NA : s);

/** Data curta em pt-BR ("05 set"), a partir de um ISO/dia (YYYY-MM-DD) real. */
export const shortDate = (value: string) => {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
};
