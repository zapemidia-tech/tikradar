// Validação do parâmetro `next` usado nos redirecionamentos de autenticação.
// Protege contra open redirect: só aceita caminhos internos absolutos.

const FALLBACK = '/dashboard';

/**
 * `true` somente para caminhos internos seguros: começam com uma única `/`,
 * não são `//`, `/\`, nem contêm esquema (`http:`), CRLF ou espaços.
 */
export function isSafeNextPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return false;
  if (value[0] !== '/') return false;
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false; // controle / CRLF
  }
  if (/\s/.test(value)) return false;
  if (value.includes('://') || value.toLowerCase().includes('\\')) return false;

  // Rejeita qualquer coisa que resolva para outra origem.
  try {
    const base = 'https://tikradar.internal';
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return false;
  } catch {
    return false;
  }
  return true;
}

/** Retorna o `next` se for seguro, senão o destino padrão (`/dashboard`). */
export function sanitizeNext(value: unknown, fallback: string = FALLBACK): string {
  return isSafeNextPath(value) ? value : fallback;
}

/** Monta `/login?next=<destino seguro>`. Omite `next` quando o valor é inseguro. */
export function loginPathWithNext(next: string, loginPath = '/login'): string {
  if (!isSafeNextPath(next)) return loginPath;
  return `${loginPath}?next=${encodeURIComponent(next)}`;
}
