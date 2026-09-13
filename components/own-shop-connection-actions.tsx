'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Botão "Desconectar loja" de Minha loja — nunca mexe na conexão do Bestsellers (sempre `purpose=own_shop`). */
export function DisconnectOwnShopButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm('Desconectar sua loja do TikRadar? Isso remove o token salvo — você pode reconectar quando quiser.')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tiktok/connection?purpose=own_shop', { method: 'DELETE', headers: { accept: 'application/json' } });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Falha ao desconectar.');
        return;
      }
      router.refresh();
    } catch {
      setError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={run} disabled={loading}>
        {loading ? (
          <>
            <span className="auth-spinner" aria-hidden="true" />
            Desconectando…
          </>
        ) : (
          'Desconectar loja'
        )}
      </button>
      {error && (
        <p className="auth-message is-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
