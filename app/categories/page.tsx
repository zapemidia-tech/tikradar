import{AppShell,PageTitle}from'@/components/app-shell';import{Categories}from'@/components/simple-pages';import{requireSessionUser}from'@/lib/auth/session';
export const dynamic='force-dynamic';
export default async function Page(){await requireSessionUser('/categories');return <AppShell active="/categories"><div className="page"><PageTitle eyebrow="MAPA DO MERCADO" title="Categorias" subtitle="Compare demanda, aceleração e volume por segmento."/><Categories/></div></AppShell>}
