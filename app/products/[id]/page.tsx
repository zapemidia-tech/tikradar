import{AppShell}from'@/components/app-shell';import{ProductDetail}from'@/components/product-detail';import{getTikTokDataProvider}from'@/lib/providers/provider-factory';import{notFound}from'next/navigation';import{requireSessionUser}from'@/lib/auth/session';import{ErrorState}from'@/components/state-message';
export const dynamic='force-dynamic';
export default async function ProductPage({params}:{params:Promise<{id:string}>}){
  await requireSessionUser('/products');
  const{id}=await params;
  let product;
  try{product=await getTikTokDataProvider().getProduct(id)}
  catch{return <AppShell active="/products"><div className="page"><ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes."/></div></AppShell>}
  if(!product)notFound();
  return <AppShell active="/products"><div className="page"><ProductDetail product={product}/></div></AppShell>;
}
