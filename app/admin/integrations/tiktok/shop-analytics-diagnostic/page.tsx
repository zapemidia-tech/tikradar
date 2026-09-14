import { AppShell, PageTitle } from '@/components/app-shell';
import { ShopAnalyticsDiagnostic } from '@/components/shop-analytics-diagnostic';
import { requireSessionUser } from '@/lib/auth/session';
import { SHOP_ANALYTICS_SCOPE } from '@/lib/tiktok/connection-purpose';

export const dynamic = 'force-dynamic';

export default async function ShopAnalyticsDiagnosticPage() {
  await requireSessionUser('/admin/integrations/tiktok/shop-analytics-diagnostic');

  return (
    <AppShell>
      <div className="page">
        <PageTitle
          eyebrow="ADMIN · INTEGRAÇÕES · MINHA LOJA"
          title="Diagnóstico: leitura de análises da minha loja"
          subtitle="Ferramenta técnica só de leitura — testa as duas APIs oficiais sem gravar nada no banco. Não é o painel de análises (ainda não existe)."
        />
        <article className="panel" style={{ padding: 24 }}>
          <p className="nir-note" style={{ margin: '0 0 16px' }}>
            Usa exclusivamente a conexão <b>Minha loja</b> (nunca a conexão do Bestsellers) do usuário autenticado, com o escopo{' '}
            <code>{SHOP_ANALYTICS_SCOPE}</code>. Chama <code>GET /analytics/{'{versão}'}/shop_videos/performance</code> (Get Shop Video Performance
            List) e <code>GET /analytics/{'{versão}'}/shop_products/performance</code> (Get Shop Product Performance List) — tenta primeiro a versão{' '}
            <b>202605</b> (a mais completa: identifica o criador em vídeos, traz o funil completo por canal em produtos) e só cai para a{' '}
            <b>202509</b> anterior se a própria TikTok disser que 202605 não está habilitada para este app; a versão que respondeu de fato aparece
            no resultado. No máximo 3 páginas de 100 registros cada. Mostra só um diagnóstico — nunca token, App Secret nem o payload bruto.
          </p>
          <ShopAnalyticsDiagnostic />
        </article>
      </div>
    </AppShell>
  );
}
