import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';

// Estados compartilhados de carregamento/vazio/erro para as páginas que
// consultam dados reais do Supabase. Reaproveita a linguagem visual já
// existente (.empty-state) em vez de criar um padrão novo.

export function LoadingState({ label = 'Carregando dados…' }: { label?: string }) {
  return (
    <div className="empty-state">
      <span className="auth-spinner" aria-hidden="true" />
      <h2>{label}</h2>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Inbox />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Não foi possível carregar os dados',
  description,
}: {
  title?: string;
  description: string;
}) {
  return (
    <div className="empty-state is-error">
      <AlertTriangle />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
