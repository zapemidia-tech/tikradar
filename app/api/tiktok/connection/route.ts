import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { SupabaseTikTokTokenStore } from '@/lib/tiktok/token-store';
import { parseConnectionPurpose } from '@/lib/tiktok/connection-purpose';

// `purpose` é obrigatório e validado (nunca um padrão implícito): esta
// tabela guarda tanto a conexão que alimenta o Bestsellers quanto a de
// "Minha loja" (ver lib/tiktok/connection-purpose.ts) — um DELETE sem
// propósito explícito já apagou os dois de uma vez no passado.
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  const raw = new URL(request.url).searchParams.get('purpose');
  if (raw !== 'own_shop' && raw !== 'bestsellers_sync') {
    return NextResponse.json({ error: 'Informe ?purpose=own_shop ou ?purpose=bestsellers_sync.' }, { status: 400 });
  }
  const purpose = parseConnectionPurpose(raw);
  try {
    const deleted = await new SupabaseTikTokTokenStore().deleteForUser(user.userId, purpose);
    return NextResponse.json({ status: 'deleted', deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao excluir conexão.' }, { status: 503 });
  }
}
