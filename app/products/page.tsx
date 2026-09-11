import{AppShell,PageTitle}from'@/components/app-shell';import{ProductsTable}from'@/components/products-table';import{getTikTokDataProvider}from'@/lib/providers/provider-factory';import{requireSessionUser}from'@/lib/auth/session';import{ErrorState}from'@/components/state-message';
export const dynamic='force-dynamic';
export default async function Products(){
  await requireSessionUser('/products');
  let products;
  try{products=await getTikTokDataProvider().getProducts()}
  catch{return <AppShell active="/products"><div className="page"><ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes."/></div></AppShell>}
  return <AppShell active="/products"><div className="page"><PageTitle eyebrow="CATÁLOGO" title="Produtos" subtitle="Encontre produtos vencedores com dados de crescimento, concorrência e demanda."/><ProductsTable products={products}/></div></AppShell>;
}
