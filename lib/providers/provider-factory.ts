import type{ProductDataProvider}from'./product-data-provider';import{MockTikTokProvider}from'./mock-tiktok-provider';import{TikTokShopProvider}from'./tiktok-shop-provider';import{getTikTokConfig}from'@/lib/tiktok/config';
// provider==='mock' -> dados demonstrativos, sempre.
// provider==='tiktok' -> lê os dados reais sincronizados no Supabase
// (products/creators/videos/lives + *_snapshots). Não depende mais das
// credenciais da API da TikTok em variáveis de ambiente: quem usa a API é o
// serviço de sincronização (services/tiktok/*), não a leitura das telas.
export function getTikTokDataProvider(env:NodeJS.ProcessEnv=process.env):ProductDataProvider{
  const config=getTikTokConfig(env);
  if(config.provider==='mock')return new MockTikTokProvider();
  try{
    return new TikTokShopProvider(env);
  }catch(error){
    if(!config.isProduction)return new MockTikTokProvider();
    throw error;
  }
}
