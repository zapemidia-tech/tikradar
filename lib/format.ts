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

/** Data completa em pt-BR ("12/09/2026"), a partir de um ISO real. `NA` se ausente/inválida. */
export const fullDate = (value: string | null | undefined) => {
  if (!value) return NA;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? NA : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

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
/** Wording específica de "Novos no radar" para evolução entre snapshots — distinta de INSUFFICIENT (usado em Opportunity Score/saturação). */
export const HISTORY_INSUFFICIENT = 'Histórico insuficiente';

/** Tooltips reutilizáveis para explicar por que um campo aparece vazio. */
export const TOOLTIP_NOT_IN_API = 'A resposta oficial da TikTok Shop não traz este campo.';
export const TOOLTIP_NEEDS_HISTORY = 'Calculado a partir de pelo menos 2 sincronizações deste item.';
export const TOOLTIP_PERIOD_NOT_SYNCED = 'Este projeto sincroniza apenas o período de 7 dias; o período de 24h ainda não é coletado.';
export const TOOLTIP_SCORE_INSUFFICIENT = 'Faltam sinais reais suficientes (crescimento, ranking, criadores, vídeos, rating...) para calcular um Opportunity Score.';
/** "Vendas estimadas" nunca é um dado oficial — ver lib/scoring/estimated-sales.ts para a fórmula completa. */
export const TOOLTIP_ESTIMATED_SALES =
  'Estimativa, não um dado oficial da TikTok Shop: GMV ÷ preço, no mesmo período. Pode ser impreciso — o preço pode ter mudado dentro da janela do GMV, e o próprio GMV já é o ponto médio de uma faixa estimada pela TikTok. Requer preço real do produto, que a API ainda não retorna para esta conta.';
export const TOOLTIP_OPEN_PRODUCT = 'Abrir produto na TikTok Shop (nova aba)';
export const TOOLTIP_GMV_TIER_CONSERVATIVE = 'Classificação conservadora baseada no limite inferior do GMV informado pelo TikTok — a faixa exibida é a faixa real recebida, não um ponto médio.';
export const TOOLTIP_FIRST_DETECTED = 'O TikRadar viu este produto pela primeira vez nesta data (com base no histórico completo de sincronizações) — ele pode existir na TikTok Shop há mais tempo.';
export const TOOLTIP_GROWTH_NEEDS_HISTORY = 'Só existe 1 snapshot deste produto até agora — é preciso pelo menos 2 sincronizações comparáveis (mesmo período, 7D) para calcular evolução real.';
export const TOOLTIP_BESTSELLERS_LIMITED = 'O Bestsellers da TikTok Shop retorna um ranking limitado de criadores em destaque — não a totalidade de criadores ativos no TikTok Shop.';
export const TOOLTIP_GMV_RANGE_ESTIMATE = 'Faixa estimada pela TikTok Shop, não um valor exato — o ponto médio é usado só para ordenar e calcular crescimento.';
export const TOOLTIP_NO_CREATOR_PRODUCT_LINK = 'Os payloads reais desta API não trazem um ID em comum entre criador e produto — criadores e produtos vêm de listas independentes. Sem essa relação verificável, o TikRadar nunca associa por nome parecido ou suposição.';

/** Rótulo em pt-BR de um período de snapshot Bestsellers, para abas de filtro e para "período consultado" por item. */
export const PERIOD_LABEL: Record<'1D' | '7D' | '30D', string> = { '1D': '1 dia', '7D': '7 dias', '30D': '30 dias' };

/** Lê `?period=` de uma URL (string, array — Next repete a chave — ou ausente) e valida contra os 3 períodos aceitos; qualquer outro valor (ou ausência) cai no padrão '7D'. */
export function parsePeriodParam(value: string | string[] | undefined): '1D' | '7D' | '30D' {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === '1D' || raw === '7D' || raw === '30D' ? raw : '7D';
}

/** Faixa de GMV formatada ("R$ X – R$ Y"); NA se qualquer um dos limites faltar — nunca um ponto médio disfarçado de faixa. */
export const gmvRange = (min: number | null | undefined, max: number | null | undefined) =>
  min === null || min === undefined || max === null || max === undefined ? NA : `${brl(min)} – ${brl(max)}`;

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
