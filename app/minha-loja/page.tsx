import { AppShell, PageTitle } from '@/components/app-shell';
import { MyShopDashboard } from '@/components/my-shop-dashboard';
import { requireSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// Página "Minha loja" — análise privada da conexão own_shop DO USUÁRIO
// AUTENTICADO. requireSessionUser já garante sessão; o isolamento entre
// usuários/lojas vem de /api/tiktok/own-shop/dashboard, que só lê a conexão
// own_shop cujo platform_user_id é o do usuário logado (nunca a conexão de
// outro usuário, nunca a do Bestsellers). Não há checagem extra de papel
// aqui: "minha loja" é sempre relativa a quem está logado, como Radar,
// Produtos etc. (mesmo padrão de app/radar/page.tsx).
export default async function MinhaLojaPage() {
  await requireSessionUser('/minha-loja');
  return (
    <AppShell active="/minha-loja">
      <div className="page">
        <PageTitle eyebrow="MINHA LOJA · DADOS PRIVADOS" title="Sua loja TikTok Shop" subtitle="Vídeos e produtos da loja que você autorizou — nunca o ranking público do Radar." />
        <MyShopDashboard />
      </div>
    </AppShell>
  );
}
