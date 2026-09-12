import { AppShell, PageTitle } from '@/components/app-shell';
import { NewInRadarGrid } from '@/components/new-in-radar-grid';
import { getTikTokDataProvider } from '@/lib/providers/provider-factory';
import { requireSessionUser } from '@/lib/auth/session';
import { EmptyState, ErrorState } from '@/components/state-message';

export const dynamic = 'force-dynamic';

export default async function NewInRadarPage() {
  await requireSessionUser('/new-in-radar');
  let items;
  try {
    items = await getTikTokDataProvider().getNewInRadar();
  } catch {
    return (
      <AppShell active="/new-in-radar">
        <div className="page">
          <ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="/new-in-radar">
      <div className="page">
        <PageTitle
          eyebrow="OPORTUNIDADES RECENTES"
          title="Novos no radar"
          subtitle="Produtos detectados pelo TikRadar nos últimos 7 dias, já com GMV 7D de pelo menos R$ 10 mil."
        />
        {items.length === 0 ? (
          <EmptyState
            title="Nenhum produto novo detectado ainda"
            description="Assim que a próxima sincronização (Admin → Integrações → TikTok Shop) trouxer um produto detectado pela 1ª vez nos últimos 7 dias e com GMV 7D de R$ 10 mil ou mais, ele aparece aqui."
          />
        ) : (
          <NewInRadarGrid items={items} />
        )}
      </div>
    </AppShell>
  );
}
