import { AppShell, PageTitle } from '@/components/app-shell';
import { AffiliateDiagnostic } from '@/components/affiliate-diagnostic';

export const dynamic = 'force-dynamic';

// Admin-gated via app/admin/layout.tsx (requireAdmin) — mesmo padrão do
// diagnóstico de shop analytics.
export default function AffiliateDiagnosticPage() {
  return (
    <AppShell>
      <div className="page">
        <PageTitle
          eyebrow="ADMIN · DIAGNÓSTICO"
          title="Diagnóstico — Minha conta de afiliado"
          subtitle="Testa as 4 Affiliate Creator APIs usando a conexão affiliate_creator do admin autenticado — só leitura, nunca grava nada."
        />
        <AffiliateDiagnostic />
      </div>
    </AppShell>
  );
}
