export class TikTokConfigError extends Error{name='TikTokConfigError'}
export class TikTokAuthError extends Error{name='TikTokAuthError'}
export class TikTokApiError extends Error{constructor(message:string,public readonly status?:number,public readonly code?:number,public readonly requestId?:string){super(message);this.name='TikTokApiError'}}
export class TikTokRateLimitError extends TikTokApiError{name='TikTokRateLimitError'}
export class TikTokSchemaError extends Error{name='TikTokSchemaError'}
