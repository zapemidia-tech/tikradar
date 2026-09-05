'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { clearRememberState } from '@/lib/auth/remember';

const MIN_LENGTH = 8;
const GENERIC_ERROR = 'Não foi possível redefinir a senha. Gere um novo link e tente novamente.';
const EXPIRED =
  'Este link de redefinição é inválido ou expirou. Solicite um novo link para continuar.';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hadError = searchParams.get('error') !== null;

  const [phase, setPhase] = useState<Phase>(hadError ? 'invalid' : 'checking');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hadError) return;
    let active = true;
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setPhase(data.session ? 'ready' : 'invalid');
      } catch {
        if (active) setPhase('invalid');
      }
    })();
    return () => {
      active = false;
    };
  }, [hadError]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');

    if (password.length < MIN_LENGTH) {
      setError(`A senha deve ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setLoading(false);
        setError(GENERIC_ERROR);
        return;
      }
      await supabase.auth.signOut();
    } catch {
      setLoading(false);
      setError(GENERIC_ERROR);
      return;
    }

    clearRememberState();
    setLoading(false);
    setPhase('done');
    setTimeout(() => {
      router.replace('/login');
      router.refresh();
    }, 2200);
  }

  if (phase === 'checking') {
    return (
      <section className="auth-form">
        <form>
          <p className="eyebrow green">REDEFINIR SENHA</p>
          <h2>Validando o link…</h2>
          <span>
            <span className="auth-spinner" aria-hidden="true" />
            Um instante.
          </span>
        </form>
      </section>
    );
  }

  if (phase === 'invalid') {
    return (
      <section className="auth-form">
        <form>
          <p className="eyebrow green">REDEFINIR SENHA</p>
          <h2>Link expirado</h2>
          <p className="auth-message is-error" role="alert">
            {EXPIRED}
          </p>
          <a className="auth-back" href="/forgot-password">
            ← Solicitar novo link
          </a>
        </form>
      </section>
    );
  }

  if (phase === 'done') {
    return (
      <section className="auth-form">
        <form>
          <p className="eyebrow green">REDEFINIR SENHA</p>
          <h2>Senha atualizada</h2>
          <p className="auth-message is-success" role="status">
            Sua senha foi redefinida com sucesso. Redirecionando para o login…
          </p>
          <a className="auth-back" href="/login">
            Ir para o login agora
          </a>
        </form>
      </section>
    );
  }

  return (
    <section className="auth-form">
      <form onSubmit={onSubmit} noValidate>
        <p className="eyebrow green">REDEFINIR SENHA</p>
        <h2>Defina uma nova senha</h2>
        <span>Escolha uma senha forte que você ainda não usou.</span>

        <label>
          Nova senha
          <div>
            <input
              type={show ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              placeholder="••••••••"
              minLength={MIN_LENGTH}
              required
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <label>
          Confirmar nova senha
          <input
            type={show ? 'text' : 'password'}
            name="confirm"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={MIN_LENGTH}
            required
          />
        </label>

        {error && (
          <p className="auth-message is-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? (
            <>
              <span className="auth-spinner" aria-hidden="true" />
              Salvando…
            </>
          ) : (
            'Redefinir senha'
          )}
        </button>
      </form>
    </section>
  );
}

export default function ResetPassword() {
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Sparkles />
          </span>
          TikRadar
        </a>
        <div>
          <p>INTELIGÊNCIA PARA TIKTOK SHOP</p>
          <h1>Quase lá.</h1>
          <span>Defina uma nova senha para voltar ao seu radar.</span>
        </div>
        <small>Depois de redefinir, você entra novamente com a nova senha.</small>
      </section>
      <Suspense fallback={<section className="auth-form" />}>
        <ResetForm />
      </Suspense>
    </main>
  );
}
