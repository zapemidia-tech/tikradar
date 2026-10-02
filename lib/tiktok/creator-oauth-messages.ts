// Catálogo único de códigos de erro do fluxo OAuth de "Minha conta de
// afiliado" — mesmo padrão de lib/tiktok/oauth-messages.ts (seller), só que
// com 2 motivos a mais específicos de criador: `cancelled` (TikTok manda um
// `error` explícito no callback quando o usuário nega a autorização — padrão
// OAuth comum; se a TikTok não mandar isso aqui, cai em `no_code` mesmo,
// nunca quebra) e `not_creator` (token trocado com sucesso, mas
// `user_type !== 1` — ver "Creator authorization guide" oficial).
//
// "Scopes ausentes" (autorização parcial) NÃO é um motivo de rejeição do
// callback — a própria TikTok documenta que o criador pode aprovar só parte
// dos scopes pedidos, e a conexão ainda é salva (mesmo padrão já usado em
// own_shop/resolveOwnShopState): o usuário vê o estado "permissão pendente"
// na tela de integrações depois, com os 3 scopes esperados marcados
// individualmente — nunca um erro genérico escondendo QUAIS faltam.
export const AFFILIATE_CREATOR_OAUTH_ERROR_MESSAGES = {
  cancelled: 'Você cancelou a autorização na TikTok Shop — nenhuma conexão foi criada.',
  no_code: 'A autorização não foi concluída (sem código de retorno da TikTok Shop) — cancelada ou fechada antes do fim.',
  state_missing: 'Não encontramos o início desta autorização neste navegador (cookie ausente ou bloqueado). Tente conectar novamente.',
  state_invalid: 'O retorno da TikTok Shop não corresponde a uma autorização iniciada por este navegador. Por segurança, a conexão foi recusada.',
  state_expired: 'Essa autorização expirou (mais de 10 minutos desde o início). Tente conectar novamente.',
  exchange_failed: 'A TikTok Shop recusou a troca do código de autorização por um token. O código pode ter expirado ou já ter sido usado.',
  not_creator: 'A conta autorizada não é uma conta de criador afiliado — a TikTok Shop retornou um outro tipo de conta (ex.: vendedor).',
  save_failed: 'O token foi emitido e validado, mas houve uma falha ao salvar a conexão. Tente novamente.',
} as const;

export type AffiliateCreatorOAuthErrorCode = keyof typeof AFFILIATE_CREATOR_OAUTH_ERROR_MESSAGES;

export function affiliateCreatorOAuthErrorMessage(code: string | null | undefined): string {
  return code && code in AFFILIATE_CREATOR_OAUTH_ERROR_MESSAGES
    ? AFFILIATE_CREATOR_OAUTH_ERROR_MESSAGES[code as AffiliateCreatorOAuthErrorCode]
    : 'Falha desconhecida ao conectar a conta de afiliado.';
}
