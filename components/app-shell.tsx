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
  Lock,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Shield,
  Store,
  Sun,
  Users,
  Video,
  TriangleAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { markTabAlive, shouldEndUnrememberedSession } from '@/lib/auth/remember';
import { relativeDate } from '@/lib/format';

const links = [
  ['/dashboard', LayoutDashboard, 'Dashboard'],
  ['/products', Box, 'Produtos'],
  ['/radar', Compass, 'Radar de Oportunidades'],
  ['/new-in-radar', Sparkles, 'Novos no radar'],
  ['/creators', Users, 'Criadores'],
  ['/shops', Store, 'Lojas'],
  ['/minha-loja', Lock, 'Minha loja'],
  ['/videos', Video, 'Vídeos'],
  ['/categories', BarChart3, 'Categorias'],
  ['/favorites', Heart, 'Favoritos'],
  ['/alerts', TriangleAlert, 'Alertas'],
  ['/settings', Settings, 'Configurações'],
] as const;

type Me = { displayName: string; role: 'user' | 'admin' } | null;
type Theme = 'light' | 'dark';

/** Botão de alternância de tema (claro/escuro): lê o atributo já aplicado
 * pelo script anti-flash em layout.tsx, alterna e persiste a escolha. */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  // O servidor sempre "chuta" escuro (não conhece a preferência salva do
  // visitante); só depois de montar — quando o script anti-flash de
  // layout.tsx já aplicou o atributo real no <html> — é seguro ler o tema
  // verdadeiro. Até lá, não renderiza o botão: evita mostrar o ícone errado
  // por um instante e qualquer divergência entre HTML do servidor e cliente.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Sincroniza com o atributo do <html>, que é a fonte da verdade (definido
    // pelo script anti-flash antes de qualquer render React) — não algo
    // derivável durante a renderização em si.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('tikradar-theme', next);
    } catch {
      /* ignora (modo privado, storage bloqueado etc.) */
    }
  }

  if (!mounted) {
    return <span className="icon-button theme-toggle" aria-hidden style={{ visibility: 'hidden' }} />;
  }

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

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
  // Menu lateral no celular: escondido por padrão (sidebar fica fora da tela
  // via transform), só abre com o botão do topbar. Fecha ao navegar (troca
  // de página desmonta/remonta o AppShell) ou ao tocar no fundo escurecido.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside className={mobileNavOpen ? 'sidebar sidebar-open' : 'sidebar'}>
        <div className="sidebar-head">
          <a className="brand" href="/dashboard">
            <span className="brand-mark">
              <Sparkles size={17} />
            </span>
            <span>TikRadar</span>
          </a>
          <button className="sidebar-close" aria-label="Fechar menu" onClick={() => setMobileNavOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <p className="eyebrow">INTELIGÊNCIA</p>
        <nav onClick={() => setMobileNavOpen(false)}>
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
          <button className="mobile-menu" aria-label="Abrir menu" onClick={() => setMobileNavOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="search">
            <Search size={17} />
            <span>Buscar produtos, lojas ou criadores...</span>
            <kbd>⌘ K</kbd>
          </div>
          <ThemeToggle />
          <button className="icon-button" aria-label="Notificações">
            <Bell size={18} />
            <i />
          </button>
          <span
            className="live"
            title={source.lastSync ? `Última sincronização: ${relativeDate(source.lastSync)}` : 'Nenhuma sincronização real ainda'}
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
