import { redirect } from 'next/navigation';

// Cadastro público está desabilitado. Novos acessos são liberados por convite
// no Supabase Dashboard. Qualquer acesso a /onboarding vai para o login.
export default function Onboarding() {
  redirect('/login');
}
