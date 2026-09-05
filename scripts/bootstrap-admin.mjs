#!/usr/bin/env node
/**
 * bootstrap-admin.mjs — criação/promoção MANUAL e LOCAL do primeiro administrador.
 *
 * Alternativa (Opção 2) ao fluxo de convite pelo Supabase Dashboard. Use apenas
 * se não puder usar o Dashboard. Prefira `supabase/admin/promote-admin.sql`.
 *
 * Garantias:
 *  - A senha é pedida interativamente e NÃO aparece no terminal, em logs, em
 *    arquivos nem no histórico do shell.
 *  - Usa a service role somente neste processo local (lida de .env.local).
 *  - Aborta se detectar ambiente de build/CI/deploy.
 *  - Idempotente: se o usuário já existe, apenas garante role = 'admin'.
 *
 * Uso:
 *   node scripts/bootstrap-admin.mjs
 *
 * Depois de criar o administrador, remova ou desabilite este script
 * (veja o README, seção "Desabilitar o bootstrap").
 */

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const ADMIN_EMAIL = 'adrielgodoymarketingdigital@gmail.com';

function abort(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// 1. Impede execução em build / CI / deploy.
const forbiddenEnv = ['CI', 'VERCEL', 'VERCEL_ENV', 'NETLIFY', 'GITHUB_ACTIONS', 'NOW_BUILDER'];
for (const key of forbiddenEnv) {
  if (process.env[key]) abort(`Ambiente "${key}" detectado. Este script só roda localmente, nunca em build/deploy.`);
}
if (process.env.NODE_ENV === 'production') abort('NODE_ENV=production. Execute apenas em ambiente local de desenvolvimento.');
if (!process.stdin.isTTY) abort('Sem terminal interativo (TTY). A senha precisa ser digitada manualmente.');

// 2. Carrega as variáveis necessárias dos arquivos .env locais (sem imprimir
//    valores). Precedência: .env.local > .env  (process.env ainda vence, abaixo).
function loadEnvFile(name, out) {
  try {
    const raw = readFileSync(resolve(process.cwd(), name), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      if (m[1] in out) continue; // não sobrescreve o arquivo de maior precedência
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[m[1]] = value;
    }
  } catch {
    /* arquivo pode não existir */
  }
  return out;
}

const fileEnv = {};
loadEnvFile('.env.local', fileEnv);
loadEnvFile('.env', fileEnv);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SECRET_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) abort('NEXT_PUBLIC_SUPABASE_URL ausente em .env.local.');
if (!SERVICE_KEY) abort('SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) ausente em .env.local.');

// 3. Leitura de senha sem eco no terminal.
function askHidden(question) {
  return new Promise((resolvePromise) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      const c = String(char);
      if (c === '\n' || c === '\r' || c === '') {
        process.stdin.removeListener('data', onData);
        return;
      }
      process.stdout.write('\x1b[2K\x1b[200D' + question);
    };
    process.stdout.write(question);
    process.stdin.on('data', onData);
    rl.question('', (answer) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolvePromise(answer);
    });
  });
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`\nBootstrap do administrador: ${ADMIN_EMAIL}`);
  const password = await askHidden('Senha (mín. 12 caracteres, não será exibida): ');
  const confirm = await askHidden('Confirme a senha: ');
  if (password.length < 12) abort('Senha muito curta (mínimo 12 caracteres).');
  if (password !== confirm) abort('As senhas não conferem.');

  // Procura usuário existente (idempotência).
  let userId = null;
  for (let page = 1; page <= 50 && !userId; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) abort(`Falha ao listar usuários: ${error.message}`);
    const found = data.users.find((u) => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (found) userId = found.id;
    if (data.users.length < 200) break;
  }

  if (userId) {
    console.log('• Usuário já existe. Atualizando senha e garantindo role = admin…');
    const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) abort(`Falha ao atualizar usuário: ${error.message}`);
  } else {
    console.log('• Criando usuário…');
    const { data, error } = await admin.auth.admin.createUser({ email: ADMIN_EMAIL, password, email_confirm: true });
    if (error) abort(`Falha ao criar usuário: ${error.message}`);
    userId = data.user.id;
  }

  // Garante a linha em profiles e promove a admin (service role ignora RLS e o trigger).
  const { error: upsertError } = await admin
    .from('profiles')
    .upsert({ id: userId, email: ADMIN_EMAIL, role: 'admin', updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (upsertError) abort(`Falha ao gravar profiles: ${upsertError.message}`);

  console.log('\n✔ Administrador pronto. Faça login em /login com o e-mail acima.');
  console.log('  Agora remova ou desabilite este script (veja o README).\n');
}

main().catch((err) => abort(err instanceof Error ? err.message : String(err)));
