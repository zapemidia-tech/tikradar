'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Sparkles } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

function safeReturnTo(): string {
  if (typeof window === 'undefined') return '/';
  const value = new URLSearchParams(window.location.search).get('return_to');
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export default function Login() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError('Email ou senha inválidos.');
      return;
    }

    router.push(safeReturnTo());
    router.refresh();
  }

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
          <h1>Descubra os próximos produtos vencedores.</h1>
          <span>Transforme dados em decisões melhores — antes que todo mundo perceba a tendência.</span>
        </div>
        <small>Dados demonstrativos nesta versão MVP.</small>
      </section>
      <section className="auth-form">
        <form onSubmit={onSubmit}>
          <p className="eyebrow green">BEM-VINDO DE VOLTA</p>
          <h2>Entre na sua conta</h2>
          <span>Acesse seu radar e continue de onde parou.</span>
          <label>
            Email
            <input type="email" name="email" placeholder="voce@empresa.com" required />
          </label>
          <label>
            Senha
            <div>
              <input type={show ? 'text' : 'password'} name="password" placeholder="••••••••" required />
              <button type="button" onClick={() => setShow(!show)}>
                <Eye size={16} />
              </button>
            </div>
          </label>
          <a href="#">Esqueceu sua senha?</a>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar no TikRadar'}
          </button>
          <p>
            Ainda não tem conta? <a href="/onboarding">Começar agora</a>
          </p>
        </form>
      </section>
    </main>
  );
}
