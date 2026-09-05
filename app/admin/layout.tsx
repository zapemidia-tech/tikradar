import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// Toda a área /admin exige sessão válida E papel admin, verificado no servidor.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin('/admin');
  return <>{children}</>;
}
