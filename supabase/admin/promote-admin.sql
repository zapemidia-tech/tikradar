-- promote-admin.sql
-- Atribui role = 'admin' ao perfil de um usuário JÁ EXISTENTE, identificado pelo e-mail.
--
-- Pré-requisitos:
--   1. As migrations 001..004 já foram aplicadas.
--   2. O usuário foi criado/convidado pelo Supabase Dashboard
--      (Authentication -> Users -> "Add user" / "Invite user").
--   3. O usuário definiu a própria senha por convite ou por "Esqueci minha senha".
--
-- Como executar: Supabase Dashboard -> SQL Editor (roda com privilégio de service role).
-- NÃO contém senha. Idempotente: rodar de novo mantém o resultado.

update public.profiles p
set    role = 'admin',
       updated_at = now()
from   auth.users u
where  u.id = p.id
  and  lower(u.email) = lower('adrielgodoymarketingdigital@gmail.com')
  and  p.role <> 'admin';

-- Conferência (deve retornar 1 linha com role = 'admin'):
select p.id, p.email, p.role, p.updated_at
from   public.profiles p
join   auth.users u on u.id = p.id
where  lower(u.email) = lower('adrielgodoymarketingdigital@gmail.com');

-- Para revogar o acesso de administrador:
-- update public.profiles p
-- set role = 'user', updated_at = now()
-- from auth.users u
-- where u.id = p.id and lower(u.email) = lower('adrielgodoymarketingdigital@gmail.com');
