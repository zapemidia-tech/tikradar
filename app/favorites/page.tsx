import{AppShell,PageTitle}from'@/components/app-shell';import{Favorites}from'@/components/simple-pages';import{requireSessionUser}from'@/lib/auth/session';
export const dynamic='force-dynamic';
export default async function Page(){await requireSessionUser('/favorites');return <AppShell active="/favorites"><div className="page"><PageTitle eyebrow="SUA COLEÇÃO" title="Favoritos" subtitle="Produtos, criadores e lojas salvos para acompanhar."/><Favorites/></div></AppShell>}
