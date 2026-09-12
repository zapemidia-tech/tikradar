import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './extra.css';
import './techno.css';
import './integration.css';
import './ranking.css';
import './legal.css';
import './landing.css';
import './auth.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'TikRadar — Inteligência para TikTok Shop',
  description: 'Descubra produtos em crescimento antes que o mercado perceba.',
  openGraph: { title: 'TikRadar', description: 'Descubra os próximos produtos vencedores.', images: ['/og.png'] },
  twitter: { card: 'summary_large_image', title: 'TikRadar', description: 'Descubra os próximos produtos vencedores.', images: ['/og.png'] },
};

// Aplica o tema (claro/escuro) antes da primeira pintura, lendo a preferência
// salva ou, na primeira visita, a preferência do sistema — evita o "flash"
// de um tema errado entre o HTML do servidor (sempre escuro) e o cliente.
const themeInitScript = `(function () {
  try {
    var stored = localStorage.getItem('tikradar-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
