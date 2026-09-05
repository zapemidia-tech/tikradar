import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(__dirname, '../supabase/migrations/004_profiles_and_roles.sql'),
  'utf8',
).toLowerCase();

describe('migration 004_profiles_and_roles', () => {
  it('cria profiles referenciando auth.users com cascade', () => {
    expect(sql).toMatch(/create table if not exists public\.profiles/);
    expect(sql).toMatch(/references auth\.users\(id\) on delete cascade/);
  });

  it('define role com valores user|admin e default user', () => {
    expect(sql).toMatch(/role\s+text[^,]*check\s*\(role in \('user', 'admin'\)\)/);
    expect(sql).toMatch(/default 'user'/);
  });

  it('habilita RLS e restringe leitura ao próprio perfil', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toMatch(/for select\s+using \(auth\.uid\(\) = id\)/);
  });

  it('bloqueia troca de role pelo cliente via trigger', () => {
    expect(sql).toMatch(/before update on public\.profiles/);
    expect(sql).toMatch(/new\.role := old\.role/);
    expect(sql).not.toMatch(/grant insert.*to authenticated/);
  });

  it('cria perfil com role=user após novo usuário', () => {
    expect(sql).toMatch(/after insert on auth\.users/);
    expect(sql).toMatch(/values \(new\.id, new\.email, 'user'\)/);
  });

  it('é idempotente', () => {
    expect(sql).toContain('create table if not exists');
    expect(sql).toContain('drop trigger if exists');
    expect(sql).toContain('drop policy if exists');
  });

  it('não contém senha nem segredos', () => {
    expect(sql).not.toMatch(/password/);
    expect(sql).not.toMatch(/service_role_key|secret_key/);
    expect(sql).not.toMatch(/insert into auth\.users/);
  });
});
