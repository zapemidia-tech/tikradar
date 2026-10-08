import { AppShell, PageTitle } from '@/components/app-shell';
import { AffiliateDashboard } from '@/components/affiliate-dashboard';
import { requireSessionUser } from '@/lib/auth/session';
import { affiliateCreatorOAuthErrorMessage } from '@/lib/tiktok/creator-oauth-messages';

export const dynamic = 'force-dynamic';

// Página "Minha conta de afiliado" — análise privada da conexão
// affiliate_creator DO USUÁRIO AUTENTICADO. Isolamento entre usuários vem
// de /api/tiktok/affiliate/dashboard (só lê a conexão affiliate_creator
// cujo platform_user_id é o do usuário logado). Mesmo padrão de
// app/minha-loja/page.tsx — sem checagem extra de papel.
//
// `?connected=1` / `?error=<código>` chegam do callback OAuth de criador
// quando quem conectou não é admin (a tela de integrações é só de admin).
export default async function MinhaContaAfiliadoPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireSessionUser('/minha-conta-afiliado');
  const sp = await searchParams;
  return (
    <AppShell active="/minha-conta-afiliado">
      <div className="page">
        <PageTitle
          eyebrow="MINHA CONTA DE AFILIADO · DADOS PRIVADOS"
          title="Sua conta de criador afiliado TikTok Shop"
          subtitle="Pedidos, vitrine e vendas por vídeo da sua conta de afiliado — separado da sua loja seller e do Radar público."
        />
        {sp.connected === '1' && (
          <p className="auth-message is-success" role="status">
            Autorização concluída. Os dados da sua conta de afiliado aparecem abaixo.
          </p>
        )}
        {sp.error && (
          <p className="auth-message is-error" role="alert">
            {affiliateCreatorOAuthErrorMessage(sp.error)}
          </p>
        )}
        <AffiliateDashboard />
      </div>
    </AppShell>
  );
}
