'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  Box,
  Compass,
  Heart,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Shield,
  Store,
  Users,
  Video,
  TriangleAlert,
  Sparkles,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { markTabAlive, shouldEndUnrememberedSession } from '@/lib/auth/remember';

const links = [
  ['/dashboard', LayoutDashboard, 'Dashboard'],
  ['/products', Box, 'Produtos'],
  ['/radar', Compass, 'Radar de Oportunidades'],
  ['/creators', Users, 'Criadores'],
  ['/shops', Store, 'Lojas'],
  ['/videos', Video, 'Vídeos'],
  ['/categories', BarChart3, 'Categorias'],
  ['/favorites', Heart, 'Favoritos'],
  ['/alerts', TriangleAlert, 'Alertas'],
  ['/settings', Settings, 'Configurações'],
] as const;

type Me = { displayName: string; role: 'user' | 'admin' } | null;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'TR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppShell({ children, active }: { children: ReactNode; active?: string }) {
  const router = useRouter();
  const [source, setSource] = useState({ label: 'Dados demonstrativos', lastSync: null as string | null });
  const [me, setMe] = useState<Me>(null);

  // "Lembrar sessão": encerra a sessão se for uma nova sessão de navegador.
  useEffect(() => {
    if (shouldEndUnrememberedSession()) {
      (async () => {
        try {
          await getSupabaseBrowserClient().auth.signOut();
        } catch {
          /* ignora */
        }
        router.replace('/login');
      })();
      return;
    }
    markTabAlive();
  }, [router]);

  useEffect(() => {
    fetch('/api/data-source/status')
      .then((r) => r.json())
      .then((x: unknown) => {
        const s = x as { label: string; lastSync?: { finished_at?: string } };
        setSource({ label: s.label, lastSync: s.lastSync?.finished_at ?? null });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((x: unknown) => {
        const s = x as { authenticated?: boolean; displayName?: string; role?: 'user' | 'admin' };
        if (s.authenticated && s.displayName) {
          setMe({ displayName: s.displayName, role: s.role === 'admin' ? 'admin' : 'user' });
        }
      })
      .catch(() => {});
  }, []);

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignora */
    }
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } catch {
      /* ignora */
    }
    router.replace('/login');
    router.refresh();
  }

  const name = me?.displayName ?? 'Minha conta';

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/dashboard">
          <span className="brand-mark">
            <Sparkles size={17} />
          </span>
          <span>TikRadar</span>
        </a>
        <p className="eyebrow">INTELIGÊNCIA</p>
        <nav>
          {links.map(([href, Icon, label]) => (
            <a className={active === href ? 'nav-item active' : 'nav-item'} href={href} key={href}>
              <Icon size={18} />
              <span>{label}</span>
              {href === '/radar' && <b>12</b>}
            </a>
          ))}
          {me?.role === 'admin' && (
            <a className={active === '/admin' ? 'nav-item active' : 'nav-item'} href="/admin">
              <Shield size={18} />
              <span>Admin</span>
            </a>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="legal-links">
            <a href="/privacy">Privacidade</a>
            <a href="/security">Segurança</a>
            <a href="/data-requests">Dados</a>
          </div>
          <button className="nav-item" type="button" onClick={logout}>
            <LogOut size={18} />
            <span>Sair</span>
          </button>
          <div className="user">
            <span>{initials(name)}</span>
            <div>
              <strong>{name}</strong>
              <small>{me?.role === 'admin' ? 'Administrador' : 'Conta'}</small>
            </div>
          </div>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div className="search">
            <Search size={17} />
            <span>Buscar produtos, lojas ou criadores...</span>
            <kbd>⌘ K</kbd>
          </div>
          <button className="icon-button" aria-label="Notificações">
            <Bell size={18} />
            <i />
          </button>
          <span
            className="live"
            title={source.lastSync ? 'Última sincronização disponível' : 'Nenhuma sincronização real'}
          >
            <i /> {source.label}
          </span>
        </header>
        {children}
      </section>
    </main>
  );
}

export function PageTitle({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="title-row">
      <div>
        <p className="eyebrow green">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export { brl, compact } from '@/lib/format';
