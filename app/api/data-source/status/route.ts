import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Indicador exibido na topbar: "Dados oficiais TikTok Shop" quando existe
// pelo menos uma sincronização concluída com sucesso (há dados reais nas
// tabelas), senão "Dados demonstrativos". A decisão é baseada em
// `data_sync_runs`, não em variáveis de ambiente da API da TikTok — os
// tokens de acesso vivem no Supabase (tiktok_connections), não no ambiente.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  let lastSync: null | {
    finished_at: string | null;
    status: string;
    error_message: string | null;
    products_received: number;
    creators_received: number;
    videos_received: number;
    lives_received: number;
  } = null;

  if (url && key) {
    const { data } = await createClient(url, key, { auth: { persistSession: false } })
      .from('data_sync_runs')
      .select('finished_at,status,error_message,products_received,creators_received,videos_received,lives_received')
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastSync = data;
  }

  const hasRealData = Boolean(lastSync);

  return NextResponse.json(
    {
      provider: hasRealData ? 'tiktok' : 'mock',
      label: hasRealData ? 'Dados oficiais TikTok Shop' : 'Dados demonstrativos',
      configured: hasRealData,
      lastSync,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
