import { AppShell, PageTitle } from '@/components/app-shell';
import { requireAdmin } from '@/lib/auth/session';
import { getDataSourceStatus } from '@/lib/tiktok/config';
import { ShieldCheck, Plug, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const admin = await requireAdmin('/admin');
  const status = getDataSourceStatus();

  return (
    <AppShell active="/admin">
      <div className="page">
        <PageTitle
          eyebrow="ÁREA ADMINISTRATIVA"
          title="Administração"
          subtitle={`Acesso restrito — autenticado como ${admin.email}.`}
        />

        <div className="integration-status">
          <article className="panel integration-card">
            <div className="panel-head">
              <div>
                <h2>Integração TikTok Shop</h2>
                <p>Status da conexão oficial e das sincronizações.</p>
              </div>
              <Plug />
            </div>
            <div className="config-row">
              <span>Provider atual</span>
              <strong className={status.label === 'TikTok Shop' ? 'ok' : ''}>{status.label}</strong>
            </div>
            <div className="config-row">
              <span>Detalhes e OAuth</span>
              <strong>
                <a href="/admin/integrations/tiktok">Abrir →</a>
              </strong>
            </div>
          </article>

          <article className="panel integration-card">
            <div className="panel-head">
              <div>
                <h2>Perfis e papéis</h2>
                <p>Usuários nascem com papel <code>user</code>.</p>
              </div>
              <Users />
            </div>
            <div className="integration-empty">
              <ShieldCheck />
              <strong>Promoção de administrador é server-side</strong>
              <p>
                A elevação para <code>admin</code> é feita apenas com credencial privada
                (Supabase SQL Editor ou script local). O frontend nunca define papéis.
              </p>
            </div>
          </article>
        </div>

        <article className="panel security-note">
          <ShieldCheck />
          <div>
            <strong>Sessão validada no servidor</strong>
            <p>
              Esta página só renderiza para sessões com <code>role = &apos;admin&apos;</code>. Visitantes
              vão para o login; usuários comuns são redirecionados ao dashboard.
            </p>
          </div>
        </article>
      </div>
    </AppShell>
  );
}
