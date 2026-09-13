// Catálogo único de códigos de erro do fluxo OAuth de "Minha loja" — usado
// tanto por app/api/tiktok/oauth/callback/route.ts (para escolher o código)
// quanto pela página de integrações (para mostrar a mensagem em pt-BR).
// Nunca a mesma mensagem genérica para motivos diferentes.
export const OWN_SHOP_OAUTH_ERROR_MESSAGES = {
  no_code: 'A autorização não foi concluída (sem código de retorno da TikTok Shop) — cancelada ou fechada antes do fim.',
  state_missing: 'Não encontramos o início desta autorização neste navegador (cookie ausente ou bloqueado). Tente conectar novamente.',
  state_invalid: 'O retorno da TikTok Shop não corresponde a uma autorização iniciada por este navegador. Por segurança, a conexão foi recusada.',
  state_expired: 'Essa autorização expirou (mais de 10 minutos desde o início). Tente conectar novamente.',
  not_seller: 'A conta autorizada não é uma conta de vendedor (Seller) — a TikTok Shop retornou um outro tipo de conta.',
  exchange_failed: 'A TikTok Shop recusou a troca do código de autorização por um token. O código pode ter expirado ou já ter sido usado.',
  shop_not_confirmed:
    'O token foi emitido, mas não foi possível confirmar a loja autorizada consultando a API oficial da TikTok Shop — a conexão não foi salva.',
  save_failed: 'A loja foi confirmada pela TikTok Shop, mas houve uma falha ao salvar a conexão. Tente novamente.',
} as const;

export type OwnShopOAuthErrorCode = keyof typeof OWN_SHOP_OAUTH_ERROR_MESSAGES;

export function ownShopOAuthErrorMessage(code: string | null | undefined): string {
  return code && code in OWN_SHOP_OAUTH_ERROR_MESSAGES ? OWN_SHOP_OAUTH_ERROR_MESSAGES[code as OwnShopOAuthErrorCode] : 'Falha desconhecida ao conectar a loja.';
}
