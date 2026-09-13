// `state` do fluxo OAuth: protege contra CSRF (comparado a um cookie
// httpOnly) e, embutindo o instante de emissão, permite validar expiração
// de forma explícita — não só confiar no `maxAge` do cookie (defesa em
// profundidade: mesmo que o cookie sobreviva mais que o esperado por algum
// motivo, o servidor rejeita um `state` velho).
const MAX_AGE_SECONDS = 600; // 10 min — mesmo valor do maxAge do cookie em authorize/route.ts

export function createOAuthState(now: Date = new Date()): string {
  const random = crypto.randomUUID().replaceAll('-', '');
  const issuedAt = Math.floor(now.getTime() / 1000);
  return `${random}.${issuedAt}`;
}

/** true = expirado OU formato irreconhecível (nunca aceita por engano um formato inesperado). */
export function isOAuthStateExpired(state: string, now: Date = new Date(), maxAgeSeconds: number = MAX_AGE_SECONDS): boolean {
  const issuedAt = Number(state.slice(state.lastIndexOf('.') + 1));
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return true;
  return now.getTime() / 1000 - issuedAt > maxAgeSeconds;
}

export type OAuthCallbackProblem = 'no_code' | 'state_missing' | 'state_invalid' | 'state_expired';

/**
 * Diagnóstico do `state` recebido no callback, distinguindo os 4 motivos de
 * falha (requisito: mensagens claras, não um "callback inválido" genérico).
 * `null` = state válido, dentro da validade, e código presente.
 */
export function diagnoseCallback(input: { code: string | null; state: string | null; expectedFromCookie: string | null; now?: Date }): OAuthCallbackProblem | null {
  if (!input.expectedFromCookie) return 'state_missing';
  if (!input.state || input.state !== input.expectedFromCookie) return 'state_invalid';
  if (isOAuthStateExpired(input.expectedFromCookie, input.now)) return 'state_expired';
  if (!input.code) return 'no_code';
  return null;
}
