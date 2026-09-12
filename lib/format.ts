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

// "Não informado" (NA) = a API nunca retorna esse campo. "Dados
// insuficientes" (INSUFFICIENT) = o campo é calculado a partir de
// histórico (crescimento, velocidade, momentum, Opportunity Score) e ainda
// não há snapshots suficientes — os dois textos existem para não confundir
// "a fonte não tem isso" com "ainda não dá pra calcular isso".
export const INSUFFICIENT = 'Dados insuficientes';

/** Tooltips reutilizáveis para explicar por que um campo aparece vazio. */
export const TOOLTIP_NOT_IN_API = 'A resposta oficial da TikTok Shop não traz este campo.';
export const TOOLTIP_NEEDS_HISTORY = 'Calculado a partir de pelo menos 2 sincronizações deste item.';
export const TOOLTIP_PERIOD_NOT_SYNCED = 'Este projeto sincroniza apenas o período de 7 dias; o período de 24h ainda não é coletado.';
export const TOOLTIP_SCORE_INSUFFICIENT = 'Faltam sinais reais suficientes (crescimento, ranking, criadores, vídeos, rating...) para calcular um Opportunity Score.';

/** Percentual de crescimento: null sempre significa histórico insuficiente, nunca "campo ausente da API". */
export const growthPct = (n: number | null | undefined) => (n === null || n === undefined ? INSUFFICIENT : `${n >= 0 ? '+' : ''}${n}%`);

/** Data relativa ("há 2 h", "há 3 dias") para datas recentes; formatada com ano além de ~30 dias. */
export const relativeDate = (value: string | null | undefined) => {
  if (!value) return NA;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return NA;
  const diffMs = Date.now() - date.getTime();
  const hours = diffMs / 3_600_000;
  if (hours < 1) return 'agora há pouco';
  if (hours < 24) return `há ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} dia${days === 1 ? '' : 's'}`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};
