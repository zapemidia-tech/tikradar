// "Lembrar sessão" — comportamento honesto no cliente.
//
// O @supabase/ssr sempre grava os cookies de sessão com validade longa e não
// expõe um modo "cookie de sessão". Então tratamos a preferência aqui:
//   - lembrar = true  -> sessão persiste normalmente entre reaberturas.
//   - lembrar = false -> ao abrir o app numa NOVA sessão de navegador
//     (nova aba/janela após fechar), a sessão é encerrada.
// Recarregar a mesma aba mantém o acesso.

const REMEMBER_KEY = 'tikradar:remember';
const TAB_KEY = 'tikradar:tab-alive';

function safeLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function setRememberSession(remember: boolean): void {
  const ls = safeLocal();
  const ss = safeSession();
  try {
    ls?.setItem(REMEMBER_KEY, remember ? '1' : '0');
    ss?.setItem(TAB_KEY, '1');
  } catch {
    /* storage indisponível: ignora */
  }
}

/**
 * Retorna `true` quando a sessão atual NÃO deve continuar (usuário pediu para
 * não lembrar e esta é uma nova sessão de navegador). O chamador deve então
 * fazer signOut + redirecionar para /login.
 */
export function shouldEndUnrememberedSession(): boolean {
  const ls = safeLocal();
  const ss = safeSession();
  if (!ls || !ss) return false;

  try {
    const remember = ls.getItem(REMEMBER_KEY);
    if (remember !== '0') return false; // "lembrar" (padrão) ou nunca definido
    if (ss.getItem(TAB_KEY) === '1') return false; // mesma sessão de navegador
    return true;
  } catch {
    return false;
  }
}

export function markTabAlive(): void {
  try {
    safeSession()?.setItem(TAB_KEY, '1');
  } catch {
    /* ignora */
  }
}

export function clearRememberState(): void {
  try {
    safeLocal()?.removeItem(REMEMBER_KEY);
    safeSession()?.removeItem(TAB_KEY);
  } catch {
    /* ignora */
  }
}
