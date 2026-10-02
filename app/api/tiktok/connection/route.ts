import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import type { ConnectionPurpose } from '@/lib/tiktok/connection-purpose';

const DELETABLE_PURPOSES: readonly ConnectionPurpose[] = ['own_shop', 'bestsellers_sync', 'affiliate_creator'];

// `purpose` é obrigatório e validado (nunca um padrão implícito): esta
// tabela guarda a conexão do Bestsellers, a de "Minha loja" E a de "Minha
// conta de afiliado" (ver lib/tiktok/connection-purpose.ts) — um DELETE sem
// propósito explícito já apagou duas de uma vez no passado.
// `deleteForUser` (token-store.ts) sempre filtra por platform_user_id E
// connection_purpose juntos — apagar 'affiliate_creator' nunca toca
// 'own_shop' nem 'bestsellers_sync', mesmo usuário ou não.
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  const raw = new URL(request.url).searchParams.get('purpose');
  const purpose = DELETABLE_PURPOSES.find((p) => p === raw);
  if (!purpose) {
    return NextResponse.json({ error: `Informe ?purpose= um de: ${DELETABLE_PURPOSES.join(', ')}.` }, { status: 400 });
  }
  try {
    const deleted = await new SupabaseTikTokTokenStore().deleteForUser(user.userId, purpose);
    return NextResponse.json({ status: 'deleted', deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao excluir conexão.' }, { status: 503 });
  }
}
