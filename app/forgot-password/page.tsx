'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const GENERIC_CONFIRMATION =
  'Se existir uma conta para este e-mail, enviamos um link para redefinir a senha. Verifique também a caixa de spam.';
const UNAVAILABLE = 'Serviço indisponível no momento. Tente novamente em instantes.';

export default function ForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`;

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    } catch {
      setLoading(false);
      setError(UNAVAILABLE);
      return;
    }

    // Mensagem genérica: não revela se o e-mail existe.
    setLoading(false);
    setSent(true);
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
          <h1>Recupere o acesso à sua conta.</h1>
          <span>Enviaremos um link seguro para você definir uma nova senha.</span>
        </div>
        <small>O link expira após um curto período por segurança.</small>
      </section>

      <section className="auth-form">
        <form onSubmit={onSubmit} noValidate>
          <p className="eyebrow green">RECUPERAÇÃO DE SENHA</p>
          <h2>Esqueci minha senha</h2>
          <span>Informe o e-mail cadastrado para receber o link de redefinição.</span>

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

          {sent && (
            <p className="auth-message is-success" role="status">
              {GENERIC_CONFIRMATION}
            </p>
          )}
          {error && (
            <p className="auth-message is-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading || sent}>
            {loading ? (
              <>
                <span className="auth-spinner" aria-hidden="true" />
                Enviando…
              </>
            ) : (
              'Enviar link de redefinição'
            )}
          </button>

          <a className="auth-back" href="/login">
            ← Voltar para o login
          </a>
        </form>
      </section>
    </main>
  );
}
