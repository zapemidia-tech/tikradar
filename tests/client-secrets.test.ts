import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const ROOT = resolve(__dirname, '..');

// Nomes de variáveis que JAMAIS podem chegar ao navegador.
const PRIVATE_ENV = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TIKTOK_SHOP_APP_SECRET',
  'TIKTOK_SHOP_ACCESS_TOKEN',
  'TIKTOK_SHOP_REFRESH_TOKEN',
  'TIKTOK_TOKEN_ENCRYPTION_KEY',
  'TIKTOK_ADMIN_SYNC_SECRET',
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extname(full))) out.push(full);
  }
  return out;
}

function isClientModule(source: string): boolean {
  const head = source.trimStart().slice(0, 40);
  return head.startsWith("'use client'") || head.startsWith('"use client"');
}

describe('segredos fora do cliente', () => {
  const sourceFiles = [
    ...walk(join(ROOT, 'app')),
    ...walk(join(ROOT, 'components')),
    ...walk(join(ROOT, 'lib')),
  ];

  it('encontrou arquivos-fonte para analisar', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it('nenhum módulo client referencia variáveis privadas', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (!isClientModule(source)) continue;
      for (const name of PRIVATE_ENV) {
        if (source.includes(name)) offenders.push(`${file} -> ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('módulos client só leem env NEXT_PUBLIC_* ou NODE_ENV', () => {
    const offenders: string[] = [];
    const envRef = /process\.env\.([A-Z0-9_]+)/g;
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (!isClientModule(source)) continue;
      for (const match of source.matchAll(envRef)) {
        const name = match[1];
        if (!name.startsWith('NEXT_PUBLIC_') && name !== 'NODE_ENV') {
          offenders.push(`${file} -> ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('o client browser do Supabase só usa chave publicável/anon', () => {
    const source = readFileSync(join(ROOT, 'lib/supabase/client.ts'), 'utf8');
    for (const name of PRIVATE_ENV) expect(source).not.toContain(name);
    expect(source).toMatch(/NEXT_PUBLIC_SUPABASE_(PUBLISHABLE_KEY|ANON_KEY)/);
  });

  it('bundle estático do navegador não contém nomes de variáveis privadas', () => {
    const staticDir = join(ROOT, '.next', 'static');
    if (!existsSync(staticDir)) return; // sem build: verificação feita no `npm run build`
    const offenders: string[] = [];
    for (const file of walk(staticDir)) {
      const source = readFileSync(file, 'utf8');
      for (const name of PRIVATE_ENV) {
        if (source.includes(name)) offenders.push(`${file} -> ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
