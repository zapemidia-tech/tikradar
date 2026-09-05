import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// Logout real: encerra a sessão no servidor e limpa os cookies do Supabase.
export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Sem Supabase configurado ou sessão já ausente: nada a fazer.
  }
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
