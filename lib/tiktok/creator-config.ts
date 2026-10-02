import { TikTokConfigError } from './errors';

// Config do app TikTok Shop SEPARADO ("TikRadar 02" — Partner Center,
// categoria Serviço personalizado → Engajamento do cliente → Colaborações
// do criador, mercado BR) usado SÓ para o fluxo de criador afiliado. NUNCA
// lê TIKTOK_SHOP_APP_KEY/TIKTOK_SHOP_APP_SECRET (do app seller) como
// fallback — app key/secret errados assinariam requisições que a TikTok
// rejeitaria (ou pior, autenticariam contra o app errado). As 3 variáveis
// abaixo (TIKTOK_CREATOR_APP_KEY, TIKTOK_CREATOR_APP_SECRET) são as ÚNICAS
// fontes de credencial de criador — documentadas em .env.example só com
// nome, nunca com valor.
export interface TikTokCreatorConfig {
  // Mesma API gateway da TikTok Shop (open-api.tiktokglobalshop.com) e do
  // endpoint de token (auth.tiktok-shops.com) usados pelo fluxo seller —
  // confirmado no guia oficial "Creator authorization guide" (2026-09-30):
  // troca/refresh de token de criador usa os MESMOS 2 endpoints do seller,
  // só muda app_key/app_secret/token usados. As chamadas às Affiliate
  // Creator APIs (Get Creator Profile etc.) também usam o mesmo
  // open-api.tiktokglobalshop.com, confirmado no path de cada endpoint.
  apiBaseUrl: string;
  authBaseUrl: string;
  // Confirmado no guia oficial: diferente do endpoint de autorização
  // seller (services.{region}.tiktokshop.com/open/authorize com
  // service_id) — autorização de criador usa shop.tiktok.com/alliance/
  // creator/auth com app_key, e `state` é OBRIGATÓRIO (não opcional como
  // no seller).
  creatorAuthorizeUrl: string;
  appKey?: string;
  appSecret?: string;
  isProduction: boolean;
}

export function getTikTokCreatorConfig(env: NodeJS.ProcessEnv = process.env): TikTokCreatorConfig {
  return {
    apiBaseUrl: 'https://open-api.tiktokglobalshop.com',
    authBaseUrl: 'https://auth.tiktok-shops.com',
    creatorAuthorizeUrl: 'https://shop.tiktok.com/alliance/creator/auth',
    appKey: env.TIKTOK_CREATOR_APP_KEY,
    appSecret: env.TIKTOK_CREATOR_APP_SECRET,
    isProduction: env.NODE_ENV === 'production',
  };
}

export function assertTikTokCreatorAppConfigured(c: TikTokCreatorConfig): asserts c is TikTokCreatorConfig & { appKey: string; appSecret: string } {
  if (!c.appKey || !c.appSecret) throw new TikTokConfigError('App do criador (TikTok Shop) não configurado: TIKTOK_CREATOR_APP_KEY e TIKTOK_CREATOR_APP_SECRET são obrigatórios.');
}

/** true só quando as 2 variáveis de app do criador estão presentes — usado pra decidir se a rota de autorização de criador pode ao menos tentar funcionar, antes de qualquer chamada de rede. */
export function isTikTokCreatorAppConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TIKTOK_CREATOR_APP_KEY && env.TIKTOK_CREATOR_APP_SECRET);
}
