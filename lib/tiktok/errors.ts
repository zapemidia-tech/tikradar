export class TikTokConfigError extends Error{name='TikTokConfigError'}
export class TikTokAuthError extends Error{name='TikTokAuthError'}
export class TikTokApiError extends Error{constructor(message:string,public readonly status?:number,public readonly code?:number,public readonly requestId?:string){super(message);this.name='TikTokApiError'}}
export class TikTokRateLimitError extends TikTokApiError{name='TikTokRateLimitError'}
// `details` é opcional e SÓ deve carregar dado já sanitizado (nunca token,
// secret, shop_cipher ou payload bruto) — quem lança decide o que cabe aí;
// esta classe não sanitiza nada sozinha. Usado por shop-analytics-service.ts
// pra anexar `SanitizedResponseShape` e permitir mostrar o diagnóstico no
// próprio endpoint de diagnóstico, sem precisar de acesso a log de servidor.
export class TikTokSchemaError extends Error{constructor(message:string,public readonly details?:Record<string,unknown>){super(message);this.name='TikTokSchemaError'}}
export function describeUnknownError(value:unknown){if(value instanceof Error)return value.message;if(typeof value==='string'&&value.trim())return value;if(value&&typeof value==='object'){const record=value as Record<string,unknown>,message=[record.message,record.details,record.hint,record.code].filter((part):part is string=>typeof part==='string'&&Boolean(part.trim())).join(' — ');if(message)return message;try{return JSON.stringify(value)}catch{}}return'Erro desconhecido'}
