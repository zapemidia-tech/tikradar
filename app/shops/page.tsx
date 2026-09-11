import{AppShell,PageTitle}from'@/components/app-shell';import{ShopsTable}from'@/components/directory-table';import{getTikTokDataProvider}from'@/lib/providers/provider-factory';import{requireSessionUser}from'@/lib/auth/session';import{ErrorState}from'@/components/state-message';
export const dynamic='force-dynamic';
export default async function Page(){
  await requireSessionUser('/shops');
  let items;
  try{items=await getTikTokDataProvider().getShops()}
  catch{return <AppShell active="/shops"><div className="page"><ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes."/></div></AppShell>}
  return <AppShell active="/shops"><div className="page"><PageTitle eyebrow="MARKETPLACE" title="Lojas" subtitle="Acompanhe vendedores, portfólios e movimentos de GMV."/><ShopsTable items={items}/></div></AppShell>;
}
