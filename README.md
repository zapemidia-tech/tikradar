# TikRadar

MVP de inteligência de mercado para TikTok Shop. O produto identifica itens em aceleração, compara saturação e ajuda afiliados, vendedores e agências a chegarem antes das tendências.

## Stack e arquitetura

Next.js App Router (16.x, Turbopack), React 19, TypeScript, Tailwind CSS, Lucide, Recharts, Zod, React Hook Form e Supabase (Auth + PostgreSQL). As telas consomem `ProductDataProvider`; nenhum componente conhece a origem dos dados. Nesta versão, `MockTikTokProvider` fornece dados demonstrativos.

O "middleware" do Next 16 fica em **`proxy.ts`** (na raiz). Ele renova a sessão do Supabase a cada requisição e aplica a proteção de rotas.

## Rotas

| Rota | Acesso |
| --- | --- |
| `/` | Pública — landing page |
| `/login` | Pública — entra com e-mail/senha (sem cadastro público) |
| `/forgot-password` | Pública — solicita link de recuperação |
| `/reset-password` | Pública — define nova senha (via link do e-mail) |
| `/auth/callback` | Pública — troca o código do link por sessão |
| `/privacy`, `/security`, `/data-requests` | Públicas |
| `/dashboard` | Protegida — exige sessão |
| `/products`, `/products/[id]`, `/radar`, `/creators`, `/shops`, `/videos`, `/categories`, `/favorites`, `/alerts`, `/settings` | Protegidas — exigem sessão |
| `/admin` e `/admin/**` | Protegidas — exigem sessão **e** `role = 'admin'` (verificado no servidor) |
| `/onboarding` | Redireciona para `/login` (cadastro público desabilitado) |

Visitante em rota protegida → redirecionado para `/login?next=<rota>` (o `next` é validado contra open redirect: só caminhos internos). Usuário autenticado em `/login` ou `/forgot-password` → redirecionado para `/dashboard`. Após login, o usuário vai para o `next` solicitado ou para `/dashboard`; administradores acessam `/admin` pelo menu lateral.

## 1. Variáveis de ambiente

Somente **nomes** — os valores ficam apenas em `.env.local` (local) e nas Environment Variables da Vercel. Nunca versione valores.

Cliente (expostas ao navegador, prefixo `NEXT_PUBLIC_`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou legado `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `NEXT_PUBLIC_APP_URL` — URL pública da aplicação (usada em metadados)

Servidor (nunca enviadas ao navegador):

- `SUPABASE_SECRET_KEY` (ou legado `SUPABASE_SERVICE_ROLE_KEY`) — service role; usada só em rotas de API e scripts locais
- `TIKTOK_DATA_PROVIDER`, `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_SHOP_SERVICE_ID`, `TIKTOK_SHOP_REDIRECT_URI`, `TIKTOK_SHOP_REGION`, `TIKTOK_SHOP_CURRENCY`, `TIKTOK_SHOP_ACCESS_TOKEN`, `TIKTOK_SHOP_REFRESH_TOKEN`, `TIKTOK_SHOP_CIPHER`, `TIKTOK_TOKEN_ENCRYPTION_KEY`, `TIKTOK_ADMIN_SYNC_SECRET`

```bash
npm install
cp .env.example .env.local   # preencha apenas localmente
npm run dev
```

Sem variáveis do Supabase, a aplicação continua funcional com dados demonstrativos e **sem** autenticação real (as rotas protegidas ficam acessíveis apenas em desenvolvimento; em produção elas são bloqueadas por padrão).

## 2. Configuração das URLs de autenticação no Supabase

No painel do Supabase → **Authentication → URL Configuration**:

- **Site URL:** a URL pública da aplicação (ex.: `http://localhost:3000` em dev; o domínio da Vercel em produção).
- **Redirect URLs (allow list):** adicione, para cada ambiente:
  - `http://localhost:3000/auth/callback`
  - `https://SEU-DOMINIO-VERCEL/auth/callback`

Em **Authentication → Providers → Email**: mantenha "Confirm email" conforme sua política; **desative "Enable sign-ups"** se quiser impedir qualquer autocadastro no nível do Supabase (a aplicação já não oferece tela de cadastro).

## 3. Callback de recuperação de senha

Fluxo:

1. `/forgot-password` chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/auth/callback?next=/reset-password })`.
2. O e-mail leva a `/auth/callback`, que troca o `code` (PKCE) — ou `token_hash`/`type` — por uma sessão em cookies HTTP e redireciona para `/reset-password`.
3. `/reset-password` valida a sessão, aceita a nova senha (`supabase.auth.updateUser`), faz `signOut` e manda para `/login`.
4. Link inválido/expirado → `/reset-password?error=expired`, com opção de pedir novo link.

No template de e-mail "Reset Password" do Supabase, o link padrão (`{{ .ConfirmationURL }}`) já respeita o `redirectTo` — não é preciso editar, desde que a Redirect URL esteja na allow list.

## 4. Aplicando as migrations

Arquivos em `supabase/migrations/`, aplicados **em ordem** pelo Supabase CLI ou pelo SQL Editor:

- `001_initial_schema.sql` — catálogo, métricas, favoritos/alertas/watchlists (com RLS)
- `002_tiktok_bestsellers_snapshots.sql` — snapshots históricos e conexões TikTok
- `003_security_privacy_controls.sql` — solicitações de privacidade e auditoria mínima
- `004_profiles_and_roles.sql` — tabela `profiles` (`id`, `email`, `role`, `created_at`, `updated_at`), RLS, trigger de criação de perfil (`role = 'user'`) e trigger que impede o cliente de alterar `role`. **Idempotente.**
- `005_video_engagement_and_product_media.sql` — colunas de `video_snapshots` (`likes`, `comments`, `shares`, `duration_seconds`, `publish_time`, `engagement_rate`) e `products.image_url`, campos que a resposta real da TikTok Shop já retorna. **Necessária antes de deployar este código** — sem ela, `/produtos` e `/vídeos` falham ao consultar essas colunas. **Idempotente.**
- `006_product_url.sql` — coluna `products.product_url`, para a miniatura do produto virar um link real para a página na TikTok Shop. Fica sempre `NULL`: nenhuma resposta real inspecionada até agora (2.161 `product_snapshots` + amostras de vídeos/criadores/lives, em 2026-09-12) traz um campo de link — só `product_image` (imagem, não página). A coluna existe pronta para quando a API passar a retornar isso (ver `productUrlFrom` em `services/tiktok/adapters.ts`). **Idempotente.**

```bash
supabase db push          # via CLI
# ou: cole cada arquivo no SQL Editor, em ordem
```

## 5. Criação segura do primeiro administrador

Administrador autorizado: `adrielgodoymarketingdigital@gmail.com`. **Nenhuma senha é definida em código ou migration.**

### Opção 1 (recomendada) — convite pelo Supabase Dashboard + SQL

1. Supabase → **Authentication → Users → "Add user"** (ou **"Invite user"**) e informe o e-mail acima.
   - "Invite user" envia um e-mail de convite; "Add user" cria o usuário e você pode marcar para enviar o link de definição de senha.
2. O usuário define a própria senha pelo link do convite **ou** pelo fluxo `/forgot-password` da aplicação.
3. Aplique a promoção de papel rodando `supabase/admin/promote-admin.sql` no **SQL Editor** (roda com service role). Ele faz:
   ```sql
   update public.profiles p
   set role = 'admin', updated_at = now()
   from auth.users u
   where u.id = p.id and lower(u.email) = lower('adrielgodoymarketingdigital@gmail.com');
   ```
4. Confirme: o `select` no fim do script deve retornar 1 linha com `role = 'admin'`.

Para revogar: rode o `update` comentado no fim do mesmo arquivo (`role = 'user'`).

### Opção 2 — script local de bootstrap (`scripts/bootstrap-admin.mjs`)

Use apenas se não puder usar o Dashboard.

```bash
node scripts/bootstrap-admin.mjs
```

- Pede a senha interativamente, **sem exibi-la**; não grava senha em arquivo, log ou histórico.
- Lê `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY` de `.env.local`; usa a service role só neste processo local.
- **Aborta** se detectar `CI`, `VERCEL`, `NODE_ENV=production` ou ausência de terminal interativo — nunca roda em build/deploy.
- Idempotente: se o usuário existe, apenas atualiza a senha e garante `role = 'admin'`.
- Não está ligado a nenhum script de `package.json`.

Nunca: criar usuário no build; colocar senha em migration ou em `.env.example`; enviar senha ao navegador; versionar credenciais.

## 6. Execução local

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

## 7. Testes e verificação

```bash
npm run test        # vitest (unit)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # next build
```

Cobertura relevante em `tests/`:

- `safe-next.test.ts` — validação do parâmetro `next` (open redirect).
- `route-access.test.ts` — `/` e `/login` públicas; `/privacy`, `/security`, `/data-requests` públicas; `/dashboard` redireciona visitante para `/login`; `/admin` bloqueia usuário comum e libera admin; usuário logado sai de `/login`.
- `profiles-migration.test.ts` — a migration `004` habilita RLS, restringe `role` a `user|admin`, impede troca de `role` pelo cliente, cria o perfil no cadastro e não contém senha.
- `client-secrets.test.ts` — nenhum módulo `'use client'` referencia variáveis privadas; o client do Supabase só usa a chave publicável/anon; se houver build, o bundle em `.next/static` não contém nomes de variáveis privadas.

## 8. Desabilitar o bootstrap

Depois de criar o administrador:

```bash
git rm scripts/bootstrap-admin.mjs
```

Ou, para manter o arquivo desabilitado, deixe a primeira linha executável como `process.exit(1)` com um comentário. O script já não roda em CI/Vercel/produção e não é referenciado por `package.json`, então também é seguro simplesmente removê-lo.

## 9. Configuração na Vercel (sem revelar valores)

1. Importe o repositório — o framework Next.js é detectado (`next build` / `next start`).
2. **Project Settings → Environment Variables:** cadastre, por **nome**, todas as variáveis da seção 1 para os ambientes Production/Preview/Development. Não cole valores neste repositório nem em PRs.
3. **Supabase → Authentication → URL Configuration:** adicione `https://SEU-DOMINIO-VERCEL/auth/callback` às Redirect URLs e ajuste a Site URL.
4. Deploy. O `proxy.ts` renova a sessão a cada requisição; nenhum segredo (`SUPABASE_SECRET_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_TOKEN_ENCRYPTION_KEY`, `TIKTOK_ADMIN_SYNC_SECRET`) é exposto ao cliente.

## Autenticação (resumo técnico)

- `@supabase/ssr` via cookies HTTP. Clientes: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server), `proxy.ts` (renovação).
- Sessão validada **no servidor** (`supabase.auth.getUser()` no `proxy.ts` e `requireSessionUser` / `requireAdmin` nas páginas). Não confiamos em `localStorage`.
- Papel lido de `public.profiles` sob RLS (cada um lê apenas o próprio perfil). O frontend nunca envia papel; a coluna `role` só é elevada a `admin` por operação server-side com service role (Opção 1/2 acima).
- Logout real: `POST /api/auth/logout` (`supabase.auth.signOut()`) + `signOut()` no cliente.
- "Lembrar sessão" (checkbox no login): quando desmarcado, a sessão é encerrada ao abrir o app numa nova sessão de navegador (o `@supabase/ssr` não expõe cookie de sessão puro nesta versão).
- Mensagens de erro de autenticação são genéricas e em português.

## Scores, providers, segurança e TikTok Shop Open API

`TIKTOK_DATA_PROVIDER=tiktok` faz `lib/providers/tiktok-shop-provider.ts` ler os dados **já sincronizados** no Supabase (`products/creators/videos/lives` + `*_snapshots`) — não chama a API da TikTok por requisição de página. Quem fala com a API é só o serviço de sincronização (`services/tiktok/*`), acionado pelo botão "Sincronizar agora" em `/admin/integrations/tiktok`. Em desenvolvimento, sem Supabase configurado, cai no mock; em produção, sem Supabase configurado, falha de forma segura (nunca mostra mock silenciosamente).

Cada indicador só aparece quando existe um campo real correspondente na resposta oficial (inspecionado em `raw_payload`). Dois textos distintos cobrem ausência de dado:

- **"Não informado"** — a API nunca retorna esse campo (ex.: comissão, vendas atribuídas de vídeo, seguidores de criador em sincronizações antigas).
- **"Dados insuficientes"** — o campo depende de histórico (crescimento, velocidade/momentum de ranking, Opportunity Score) e ainda não há snapshots suficientes (mínimo 2, ou 3 no caso do score).

O **Opportunity Score** (`lib/scoring/real-opportunity-score.ts`) é uma média ponderada só dos fatores realmente disponíveis — nenhum fator ausente vira zero, o peso dele é redistribuído entre os presentes. Pesos, referências de normalização e o mínimo de fatores exigido ficam centralizados e documentados nesse arquivo. Resultado salvo (append-only) em `opportunity_scores` a cada sincronização bem-sucedida de produtos.

**Comissão** e **vendas/unidades atribuídas** não têm fonte em nenhum endpoint usado por este projeto (`/analytics/202511/{products|creators|videos|lives}/bestselling`) — confirmado inspecionando `raw_payload` real. Preencher esses campos exigiria um endpoint adicional da TikTok Shop (comissão do produto/afiliado e atribuição de vendas por conteúdo/pedido), com escopo próprio além de `data.bestselling.public.read`, que este projeto não implementa e não deve simular.

**Miniaturas clicáveis e "Vendas estimadas":** a miniatura do produto (em `/products`, `/radar`, `/products/[id]` e `/videos`) só vira um link (`target="_blank"`) quando existe uma URL real de produto (`Product.productUrl`/`Video.productUrl`) — nunca construída a partir do `product_id`. Hoje nenhum produto sincronizado tem essa URL: confirmado em 2026-09-12 inspecionando `raw_payload` de **todos** os `product_snapshots` já sincronizados (2.161 registros) e amostras de vídeos/criadores/lives — a resposta real só traz `id, name, rank, rating, shop_id, shop_name, gmv_range, product_image` (e variações por tipo de entidade); nenhum campo de link de produto existe. Ver `services/tiktok/adapters.ts` (função `productUrlFrom`) para onde mapear se a API passar a retornar isso.

"**Vendas estimadas**" (GMV ÷ preço, no mesmo snapshot) é uma estimativa, nunca um dado oficial — fórmula e limitações documentadas em `lib/scoring/estimated-sales.ts`. Hoje aparece como "Não informado" para todos os produtos: a mesma inspeção confirmou que **nenhum** `product_snapshot` sincronizado tem `price` (nem `sold_count`) preenchido — a resposta real de produtos não traz preço para esta conta.

Ver também `lib/providers/provider-factory.ts`, `docs/security/` e as páginas `/privacy`, `/security`, `/data-requests`.

Nunca preencha ou compartilhe `.env.example`. Copie-o para `.env.local`, preencha apenas localmente e mantenha fora do controle de versão.
