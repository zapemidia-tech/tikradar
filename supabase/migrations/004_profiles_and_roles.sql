-- 004_profiles_and_roles.sql
-- Perfis de usuário e papéis (user | admin) para o TikRadar.
-- Idempotente: pode ser reexecutada sem efeitos colaterais.
-- NÃO contém senhas, tokens ou segredos. A promoção de administrador é feita
-- separadamente (ver supabase/admin/promote-admin.sql e o README).

create extension if not exists "pgcrypto";

-- 1. Tabela de perfis -------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil por usuário autenticado. A coluna role só pode ser elevada a admin por operação server-side com service role.';

-- Reforça o default/checagem mesmo em bases onde a tabela já existia.
alter table public.profiles
  alter column role set default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;
end $$;

-- 2. RLS ------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Usuário autenticado enxerga somente o próprio perfil.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select
  using (auth.uid() = id);

-- Usuário autenticado pode atualizar apenas o próprio perfil.
-- A troca de role é bloqueada pelo trigger abaixo (não confiamos no cliente).
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Sem policy de INSERT/DELETE para authenticated: perfis nascem do trigger
-- em auth.users e só o service role (que ignora RLS) administra a tabela.
revoke insert, delete on public.profiles from authenticated, anon;
grant select, update on public.profiles to authenticated;

-- 3. Bloqueio de escalonamento de privilégio ---------------------------------
-- Se a atualização vier de um cliente autenticado/anônimo, o role é forçado
-- ao valor anterior. Operações com service role (current_user = 'service_role'
-- ou execução direta como 'postgres'/'supabase_admin') passam livremente.
create or replace function public.tikradar_lock_profile_role()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.role := old.role;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tikradar_lock_profile_role on public.profiles;
create trigger tikradar_lock_profile_role
  before update on public.profiles
  for each row
  execute function public.tikradar_lock_profile_role();

-- 4. Criação automática do perfil (role = 'user') ---------------------------
create or replace function public.tikradar_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.tikradar_handle_new_user();

-- 5. Backfill de usuários já existentes -----------------------------------
insert into public.profiles (id, email, role)
select u.id, u.email, 'user'
from auth.users u
on conflict (id) do nothing;
