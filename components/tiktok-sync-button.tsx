'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type SyncCounts = { products: number; creators: number; videos: number; lives: number };
type Result = { ok: boolean; message: string } | null;

// Substitui o <form method="post"> puro: aquele envio fazia uma navegação de
// página inteira e a página não lê o resultado da URL, então o clique
// "recarregava" sem nunca mostrar se a sincronização deu certo ou o motivo
// da falha. Aqui o resultado (sucesso com contagens, ou o erro real) aparece
// na hora, sem sair da página.
export function TikTokSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/tiktok/sync', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as {
        counts?: SyncCounts;
        error?: string;
      };

      if (res.ok && data.counts) {
        const c = data.counts;
        setResult({
          ok: true,
          message: `Sincronização concluída: ${c.products} produtos, ${c.creators} criadores, ${c.videos} vídeos, ${c.lives} lives.`,
        });
        router.refresh();
      } else {
        setResult({ ok: false, message: data.error || 'Falha na sincronização.' });
      }
    } catch {
      setResult({ ok: false, message: 'Não foi possível conectar ao servidor. Tente novamente.' });
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
            Sincronizando…
          </>
        ) : (
          'Sincronizar agora'
        )}
      </button>
      {result && (
        <p className={result.ok ? 'auth-message is-success' : 'auth-message is-error'} role={result.ok ? 'status' : 'alert'}>
          {result.message}
        </p>
      )}
    </div>
  );
}
