import{AppShell,PageTitle}from'@/components/app-shell';import{Alerts}from'@/components/simple-pages';import{requireSessionUser}from'@/lib/auth/session';
export const dynamic='force-dynamic';
export default async function Page(){await requireSessionUser('/alerts');return <AppShell active="/alerts"><div className="page"><PageTitle eyebrow="MONITORAMENTO" title="Alertas" subtitle="Mudanças importantes detectadas nos itens que você acompanha."/><Alerts/></div></AppShell>}
