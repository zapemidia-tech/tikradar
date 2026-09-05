'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { sanitizeNext } from '@/lib/auth/safe-next';
import { setRememberSession } from '@/lib/auth/remember';

const GENERIC_ERROR = 'Não foi possível entrar. Verifique o e-mail e a senha e tente novamente.';
const UNAVAILABLE = 'Login indisponível no momento. Tente novamente em instantes.';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get('next'));

  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    let signInError: unknown = null;
    try {
      const supabase = getSupabaseBrowserClient();
      const result = await supabase.auth.signInWithPassword({ email, password });
      signInError = result.error;
    } catch {
      setLoading(false);
      setError(UNAVAILABLE);
      return;
    }

    if (signInError) {
      setLoading(false);
      setError(GENERIC_ERROR);
      return;
    }

    setRememberSession(remember);
    router.replace(next);
    router.refresh();
  }

  return (
    <section className="auth-form">
      <form onSubmit={onSubmit} noValidate>
        <p className="eyebrow green">BEM-VINDO DE VOLTA</p>
        <h2>Entre na sua conta</h2>
        <span>Acesse seu radar e continue de onde parou.</span>

        <label>
          E-mail
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="voce@empresa.com"
            required
          />
        </label>

        <label>
          Senha
          <div>
            <input
              type={show ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
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

        <div className="auth-row">
          <label className="auth-remember">
            <input
              type="checkbox"
              name="remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Lembrar sessão
          </label>
          <a className="auth-link-inline" href="/forgot-password">
            Esqueci minha senha
          </a>
        </div>

        {error && (
          <p className="auth-message is-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? (
            <>
              <span className="auth-spinner" aria-hidden="true" />
              Entrando…
            </>
          ) : (
            'Entrar'
          )}
        </button>
      </form>
    </section>
  );
}

export default function Login() {
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
          <h1>Enxergue as tendências antes do mercado.</h1>
          <span>Transforme sinais de crescimento em decisões melhores.</span>
        </div>
        <small>Acesso restrito. Novos acessos são liberados por convite.</small>
      </section>
      <Suspense fallback={<section className="auth-form" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
