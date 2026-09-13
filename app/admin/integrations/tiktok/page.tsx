import { AppShell, PageTitle } from '@/components/app-shell';
import { getTikTokConfig } from '@/lib/tiktok/config';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import { requireSessionUser } from '@/lib/auth/session';
import { createClient } from '@supabase/supabase-js';
import { ShieldCheck, KeyRound, Database, Zap, Store } from 'lucide-react';
import { TikTokSyncButton } from '@/components/tiktok-sync-button';
import { DisconnectOwnShopButton } from '@/components/own-shop-connection-actions';
import { hasShopAnalyticsScope, resolveOwnShopState, SHOP_ANALYTICS_SCOPE } from '@/lib/tiktok/connection-purpose';
import { ownShopOAuthErrorMessage } from '@/lib/tiktok/oauth-messages';

export const dynamic = 'force-dynamic';

/** Mostra só os 4 últimos caracteres — o cipher da loja não é listado junto de token/refresh token/app secret no requisito, mas é um identificador da loja, então evitamos exibi-lo por completo mesmo assim. */
function maskTail(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length <= 4 ? value : `••••${value.slice(-4)}`;
}

export default async function TikTokIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ purpose?: string; connected?: string; error?: string }>;
}) {
  const c = getTikTokConfig();
  const user = await requireSessionUser('/admin/integrations/tiktok');
  const sp = await searchParams;

  const store = new SupabaseTikTokTokenStore();
  let bestsellersConnection: Awaited<ReturnType<SupabaseTikTokTokenStore['status']>> = null;
  let ownShopConnection: Awaited<ReturnType<SupabaseTikTokTokenStore['status']>> = null;
  let lastSync: null | { status: string; finished_at: string | null; error_message: string | null } = null;
  try {
    [bestsellersConnection, ownShopConnection] = await Promise.all([store.status(user.userId, 'bestsellers_sync'), store.status(user.userId, 'own_shop')]);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const { data } = await createClient(url, key).from('data_sync_runs').select('status,finished_at,error_message').order('started_at', { ascending: false }).limit(1).maybeSingle();
      lastSync = data;
    }
  } catch {
    /* painéis abaixo tratam null como "sem dado ainda" */
  }

  // --- Painel 1: dados públicos Bestsellers (inalterado na essência; só
  // renomeado para não ser confundido com "Minha loja") -------------------
  const bestsellersConnected = Boolean(bestsellersConnection?.shop_cipher);
  const bestsellersTokenValid = Boolean(bestsellersConnection && new Date(bestsellersConnection.access_token_expires_at) > new Date());
  const bestsellersRows: [string, string][] = [
    ['Provider atual', bestsellersConnected ? 'TikTok Shop conectado' : 'Dados demonstrativos'],
    ['App Key configurada', c.appKey ? 'Sim' : 'Não'],
    ['App Secret configurado', c.appSecret ? 'Sim' : 'Não'],
    ['Conexão do Bestsellers', bestsellersConnected ? 'Sim' : 'Não'],
    ['Access token', bestsellersTokenValid ? 'Protegido e válido' : bestsellersConnection ? 'Expirado' : 'Não configurado'],
    ['Região', bestsellersConnection?.seller_base_region ?? c.region],
    ['Moeda', c.currency],
  ];

  // --- Painel 2: Minha loja (nova) ----------------------------------------
  const ownShopState = resolveOwnShopState(ownShopConnection);
  const ownShopScopeOk = hasShopAnalyticsScope(ownShopConnection?.granted_scopes);
  const purpose = sp.purpose === 'own_shop' ? 'own_shop' : sp.purpose === 'bestsellers_sync' ? 'bestsellers_sync' : null;
  const showOwnShopSuccess = purpose === 'own_shop' && sp.connected === '1';
  const showOwnShopError = purpose === 'own_shop' && Boolean(sp.error);

  const ownShopStatusLabel: Record<typeof ownShopState, string> = {
    not_connected: 'Não conectada',
    expired: 'Sessão expirada — reconecte',
    permission_pending: 'Autorizada — permissão ainda não confirmada',
    ready: 'Conectada e confirmada',
  };

  return (
    <AppShell>
      <div className="page">
        <PageTitle
          eyebrow="ADMIN · INTEGRAÇÕES"
          title="TikTok Shop Open API"
          subtitle="Dados públicos do Bestsellers e a autorização da sua própria loja são conexões separadas — nunca a mesma."
        />
        <div className="integration-status">
          <article className="panel integration-card">
            <div className="panel-head">
              <div>
                <h2>Dados públicos TikTok Shop (Bestsellers)</h2>
                <p>Ranking público de produtos/criadores/vídeos/lives — não é a sua loja.</p>
              </div>
              <ShieldCheck />
            </div>
            {bestsellersRows.map(([k, v]) => (
              <div className="config-row" key={k}>
                <span>{k}</span>
                <strong className={v === 'Sim' || v === 'Protegido e válido' || v === 'TikTok Shop conectado' ? 'ok' : ''}>{v}</strong>
              </div>
            ))}
          </article>

          <article className="panel integration-card">
            <div className="panel-head">
              <div>
                <h2>Sincronização</h2>
                <p>Coletas somente sob demanda.</p>
              </div>
              <Database />
            </div>
            <div className="integration-empty">
              <Zap />
              <strong>{lastSync?.status === 'success' ? 'Última sincronização concluída' : 'Nenhuma sincronização real concluída'}</strong>
              <p>
                {lastSync?.status === 'success'
                  ? lastSync.error_message ?? 'Última sincronização concluída.'
                  : lastSync?.status === 'failed'
                    ? lastSync.error_message
                    : bestsellersConnected
                      ? 'Conexão pronta para a primeira coleta oficial.'
                      : 'Autorize novamente para concluir a identificação da loja do Bestsellers.'}
              </p>
              {bestsellersConnected && bestsellersTokenValid && <TikTokSyncButton />}
              {!bestsellersConnected && <a href="/api/tiktok/oauth/authorize">Concluir conexão do Bestsellers</a>}
            </div>
          </article>

          <article className="panel integration-card">
            <div className="panel-head">
              <div>
                <h2>Minha loja TikTok Shop</h2>
                <p>Autorize sua própria conta de vendedor — ainda só prova a autorização, sem painéis de análise.</p>
              </div>
              <Store />
            </div>

            {showOwnShopSuccess && (
              <p className="auth-message is-success" role="status">
                Autorização concluída.{' '}
                {ownShopState === 'ready'
                  ? 'Loja confirmada e com a permissão de análise já concedida.'
                  : ownShopState === 'permission_pending'
                    ? `Loja confirmada, mas a permissão "${SHOP_ANALYTICS_SCOPE}" ainda não foi concedida — permissão ainda não confirmada.`
                    : ''}
              </p>
            )}
            {showOwnShopError && (
              <p className="auth-message is-error" role="alert">
                {ownShopOAuthErrorMessage(sp.error)}
              </p>
            )}

            <div className="config-row">
              <span>Status</span>
              <strong className={ownShopState === 'ready' ? 'ok' : ''}>{ownShopStatusLabel[ownShopState]}</strong>
            </div>
            {ownShopConnection && (
              <>
                <div className="config-row">
                  <span>Loja identificada</span>
                  <strong>{ownShopConnection.seller_name ?? 'Não informado pela API'}</strong>
                </div>
                <div className="config-row">
                  <span>Região</span>
                  <strong>{ownShopConnection.seller_base_region ?? 'Não informado'}</strong>
                </div>
                <div className="config-row">
                  <span>Identificador da loja (shop cipher)</span>
                  <strong>{maskTail(ownShopConnection.shop_cipher)}</strong>
                </div>
                <div className="config-row">
                  <span>Permissão &quot;{SHOP_ANALYTICS_SCOPE}&quot;</span>
                  <strong className={ownShopScopeOk ? 'ok' : ''}>{ownShopScopeOk ? 'Confirmada' : 'Ainda não confirmada'}</strong>
                </div>
                <div className="config-row">
                  <span>Última autorização</span>
                  <strong>{ownShopConnection.updated_at ? new Date(ownShopConnection.updated_at).toLocaleString('pt-BR') : 'Não informado'}</strong>
                </div>
              </>
            )}

            <div className="integration-empty">
              <a href="/api/tiktok/oauth/authorize?purpose=own_shop">{ownShopConnection ? 'Reconectar loja' : 'Conectar loja'}</a>
              {ownShopConnection && <DisconnectOwnShopButton />}
            </div>

            <p className="nir-note">
              Este app TikTok Shop ainda está em rascunho no Partner Center — a autorização hoje só é testável com uma <b>Development/Sandbox Shop</b>{' '}
              (é o que já acontece com a conexão do Bestsellers acima, autorizada contra uma loja cujo nome começa com &quot;SANDBOX_&quot;). Conectar uma loja
              real de vendas exige que o app seja revisado/publicado pela TikTok, ou que essa loja real seja adicionada como testadora no Partner Center —
              não prometemos aqui uma conexão com uma loja real antes disso.
            </p>
          </article>
        </div>

        <article className="panel security-note">
          <KeyRound />
          <div>
            <strong>Credenciais protegidas</strong>
            <p>App Secret, access token e refresh token permanecem exclusivamente no servidor, criptografados em repouso — nunca aparecem no navegador, em logs ou em respostas de API.</p>
          </div>
        </article>
      </div>
    </AppShell>
  );
}
