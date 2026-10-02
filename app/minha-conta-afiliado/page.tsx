import { AppShell, PageTitle } from '@/components/app-shell';
import { AffiliateDashboard } from '@/components/affiliate-dashboard';
import { requireSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// Página "Minha conta de afiliado" — análise privada da conexão
// affiliate_creator DO USUÁRIO AUTENTICADO. Isolamento entre usuários vem
// de /api/tiktok/affiliate/dashboard (só lê a conexão affiliate_creator
// cujo platform_user_id é o do usuário logado). Mesmo padrão de
// app/minha-loja/page.tsx — sem checagem extra de papel.
export default async function MinhaContaAfiliadoPage() {
  await requireSessionUser('/minha-conta-afiliado');
  return (
    <AppShell active="/minha-conta-afiliado">
      <div className="page">
        <PageTitle
          eyebrow="MINHA CONTA DE AFILIADO · DADOS PRIVADOS"
          title="Sua conta de criador afiliado TikTok Shop"
          subtitle="Pedidos, vitrine e vendas por vídeo da sua conta de afiliado — separado da sua loja seller e do Radar público."
        />
        <AffiliateDashboard />
      </div>
    </AppShell>
  );
}
