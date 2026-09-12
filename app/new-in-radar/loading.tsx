import { AppShell } from '@/components/app-shell';
import { LoadingState } from '@/components/state-message';

export default function LoadingNewInRadar() {
  return (
    <AppShell active="/new-in-radar">
      <div className="page">
        <LoadingState label="Carregando produtos detectados recentemente…" />
      </div>
    </AppShell>
  );
}
