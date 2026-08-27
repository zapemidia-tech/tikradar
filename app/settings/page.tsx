'use client';
import { useState } from 'react';
import { AppShell, PageTitle } from '@/components/app-shell';

export default function Page() {
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AppShell active="/settings">
      <div className="page">
        <PageTitle eyebrow="PREFERÊNCIAS" title="Configurações" subtitle="Personalize sua experiência no TikRadar." />
        <article className="panel settings">
          <h2>Preferências de pesquisa</h2>
          <label>
            País
            <select>
              <option>Brasil</option>
            </select>
          </label>
          <label>
            Período padrão
            <select>
              <option>Últimos 7 dias</option>
              <option>24 horas</option>
              <option>30 dias</option>
            </select>
          </label>
          <label className="toggle">
            <span>
              <strong>Atualizações do Radar</strong>
              <small>Exibir novos sinais dentro da plataforma</small>
            </span>
            <input type="checkbox" defaultChecked />
          </label>
          <button onClick={save}>{saved ? 'Salvo!' : 'Salvar alterações'}</button>
        </article>
      </div>
    </AppShell>
  );
}
