import{AppShell,PageTitle}from'@/components/app-shell';import{VideosTable}from'@/components/directory-table';import{getTikTokDataProvider}from'@/lib/providers/provider-factory';import{requireSessionUser}from'@/lib/auth/session';import{ErrorState}from'@/components/state-message';
export const dynamic='force-dynamic';
export default async function Page(){
  await requireSessionUser('/videos');
  let items;
  try{items=await getTikTokDataProvider().getVideos()}
  catch{return <AppShell active="/videos"><div className="page"><ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes."/></div></AppShell>}
  return <AppShell active="/videos"><div className="page"><PageTitle eyebrow="CONTEÚDO QUE VENDE" title="Vídeos" subtitle="Veja quais conteúdos estão convertendo atenção em receita."/><VideosTable items={items}/></div></AppShell>;
}
