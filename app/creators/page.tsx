import { AppShell, PageTitle } from '@/components/app-shell';
import { CreatorsTable } from '@/components/directory-table';
import { getTikTokDataProvider } from '@/lib/providers/provider-factory';
import { requireSessionUser } from '@/lib/auth/session';
import { ErrorState } from '@/components/state-message';
import { parsePeriodParam, PERIOD_LABEL, TOOLTIP_BESTSELLERS_LIMITED, TOOLTIP_GMV_RANGE_ESTIMATE } from '@/lib/format';
import type { SnapshotPeriod } from '@/types';

export const dynamic = 'force-dynamic';

const PERIODS: SnapshotPeriod[] = ['1D', '7D', '30D'];

export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  await requireSessionUser('/creators');
  const period = parsePeriodParam((await searchParams).period);

  let items;
  try {
    items = await getTikTokDataProvider().getCreators(period);
  } catch {
    return (
      <AppShell active="/creators">
        <div className="page">
          <ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="/creators">
      <div className="page">
        <PageTitle eyebrow="ECOSSISTEMA" title="Criadores" subtitle="Descubra quem transforma conteúdo em vendas no TikTok Shop." />

        <div className="tabs" role="tablist" aria-label="Período">
          {PERIODS.map((p) => (
            <a key={p} href={p === '7D' ? '/creators' : `/creators?period=${p}`} className={p === period ? 'active' : ''}>
              {PERIOD_LABEL[p]}
            </a>
          ))}
        </div>

        <p className="nir-note" title={TOOLTIP_BESTSELLERS_LIMITED}>
          O Bestsellers da TikTok Shop retorna um ranking limitado de criadores em destaque — não a totalidade de criadores ativos no
          TikTok Shop.
        </p>
        <p className="nir-note" title={TOOLTIP_GMV_RANGE_ESTIMATE}>
          O GMV mostrado é a faixa estimada pela própria TikTok Shop para o período consultado, nunca um valor exato.
        </p>

        <CreatorsTable items={items} period={period} />
      </div>
    </AppShell>
  );
}
