export type BestsellersPeriod='1D'|'7D'|'30D';export type TikTokCurrency='LOCAL'|'USD';export type BestsellersKind='products'|'creators'|'videos'|'lives';
export interface BestsellersQuery{period?:BestsellersPeriod;currency?:TikTokCurrency;date?:string;categoryId?:string}
export interface TikTokApiEnvelope<T=unknown>{code:number;message:string;request_id?:string;data:T}
export interface TikTokOAuthTokens{accessToken:string;accessTokenExpiresAt:number;refreshToken:string;refreshTokenExpiresAt:number;openId:string;sellerName?:string;sellerBaseRegion?:string;userType:number;grantedScopes:string[];shopCipher?:string}
export interface TikTokConnection extends TikTokOAuthTokens{shopCipher?:string;updatedAt:string}
export interface GmvRange{gmvMin:number|null;gmvMax:number|null;gmvEstimated:number|null;gmvDisplay:string;currency:TikTokCurrency;isExact:false}
export interface NormalizedBestseller{externalId:string;ranking:number;name?:string;username?:string;followersCount?:number;gmv:GmvRange;soldCount?:number;price?:number;creatorCount?:number;videoCount?:number;reviewCount?:number;rating?:number;creatorExternalId?:string;productExternalId?:string;views?:number;shopExternalId?:string;shopName?:string;imageUrl?:string;likes?:number;comments?:number;shares?:number;durationSeconds?:number;publishTimeIso?:string;engagementRate?:number;rawPayload:unknown}
export interface SyncCounts{products:number;creators:number;videos:number;lives:number}
