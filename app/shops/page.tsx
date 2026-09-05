import{AppShell,PageTitle}from'@/components/app-shell';import{ShopsTable}from'@/components/directory-table';import{getTikTokDataProvider}from'@/lib/providers/provider-factory';import{requireSessionUser}from'@/lib/auth/session';
export const dynamic='force-dynamic';
export default async function Page(){await requireSessionUser('/shops');return <AppShell active="/shops"><div className="page"><PageTitle eyebrow="MARKETPLACE" title="Lojas" subtitle="Acompanhe vendedores, portfólios e movimentos de GMV."/><ShopsTable items={await getTikTokDataProvider().getShops()}/></div></AppShell>}
