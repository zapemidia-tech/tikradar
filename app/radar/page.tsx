import{AppShell,PageTitle}from'@/components/app-shell';import{RadarGrid}from'@/components/radar-grid';import{getTikTokDataProvider}from'@/lib/providers/provider-factory';import{requireSessionUser}from'@/lib/auth/session';import{EmptyState,ErrorState}from'@/components/state-message';
export const dynamic='force-dynamic';
export default async function Radar(){
  await requireSessionUser('/radar');
  let products;
  try{products=(await getTikTokDataProvider().getProducts()).sort((a,b)=>(b.opportunityScore??-1)-(a.opportunityScore??-1)||(b.growth7d??-Infinity)-(a.growth7d??-Infinity))}
  catch{return <AppShell active="/radar"><div className="page"><ErrorState description="Falha ao consultar os dados sincronizados no Supabase. Tente novamente em instantes."/></div></AppShell>}
  const opportunities=products.filter(p=>(p.opportunityScore??-1)>=80).length;
  const accelerating=products.filter(p=>(p.growth7d??-1)>50).length;
  const growthValues=products.map(p=>p.growth7d).filter((v):v is number=>v!==null);
  const avgGrowth=growthValues.length?Math.round(growthValues.reduce((s,v)=>s+v,0)/growthValues.length):null;
  return <AppShell active="/radar"><div className="page"><PageTitle eyebrow="RADAR DE OPORTUNIDADES" title="Chegue antes da tendência." subtitle="Produtos ganhando velocidade enquanto a saturação ainda está sob controle."/>
    <div className="radar-summary">
      <div><span>{opportunities}</span><p>fortes oportunidades</p></div>
      <div><span>{accelerating}</span><p>produtos acelerando (7d)</p></div>
      <div><span>{avgGrowth===null?'—':`${avgGrowth>=0?'+':''}${avgGrowth}%`}</span><p>crescimento médio (7d)</p></div>
      <div><span>{products.length}</span><p>produtos monitorados</p></div>
    </div>
    {products.length===0?<EmptyState title="Nenhum produto sincronizado ainda" description="Rode uma sincronização em Admin → Integrações → TikTok Shop para ver o radar."/>:<RadarGrid products={products}/>}
  </div></AppShell>;
}
