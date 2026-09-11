import{AppShell,PageTitle}from'@/components/app-shell';import{CreatorsTable}from'@/components/directory-table';import{getTikTokDataProvider}from'@/lib/providers/provider-factory';import{requireSessionUser}from'@/lib/auth/session';import{ErrorState}from'@/components/state-message';
export const dynamic='force-dynamic';
export default async function Page(){
  await requireSessionUser('/creators');
  let items;
  try{items=await getTikTokDataProvider().getCreators()}
  catch{return <AppShell active="/creators"><div className="page"><ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes."/></div></AppShell>}
  return <AppShell active="/creators"><div className="page"><PageTitle eyebrow="ECOSSISTEMA" title="Criadores" subtitle="Descubra quem transforma conteúdo em vendas no TikTok Shop."/><CreatorsTable items={items}/></div></AppShell>;
}
