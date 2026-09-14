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
| `/products`, `/products/[id]`, `/radar`, `/new-in-radar`, `/creators`, `/shops`, `/videos`, `/categories`, `/favorites`, `/alerts`, `/settings` | Protegidas — exigem sessão |
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
- `007_new_in_radar_indexes.sql` — 2 índices (`products.created_at`, `product_snapshots(product_id,period,captured_at)`) para a página **Novos no radar** consultar sem escanear o catálogo/histórico inteiro. Só cria índices, não muda dado nenhum. **Recomendada antes do deploy** (sem ela a página funciona, só faz sequential scan). **Idempotente.**
- `008_creator_avatar.sql` — coluna `creators.avatar_url`, para a página **Criadores** mostrar a foto de perfil real quando a API passar a retorná-la (hoje sempre `NULL` — ver seção "Criadores" abaixo). **Necessária antes de deployar este código** — sem ela, `/creators` falha ao consultar essa coluna. **Idempotente.**
- `009_connection_purpose.sql` — coluna `tiktok_connections.connection_purpose` (`'bestsellers_sync'` ou `'own_shop'`), para separar a conexão que alimenta o Bestsellers da conexão de **Minha loja**. **Necessária antes de deployar este código** — sem ela, `/api/tiktok/oauth/callback` e `/admin/integrations/tiktok` falham ao consultar essa coluna. Preserva a linha já existente (fica `'bestsellers_sync'` por padrão). **Idempotente.**
- `010_fix_connection_purpose_unique_index.sql` — corrige uma aplicação **parcial** da 009 observada em produção em 2026-09-13: a coluna `connection_purpose` existia, mas o índice único `tiktok_connections_user_open_purpose_idx` (que a 009 também deveria criar) nunca chegou a existir. Recria esse índice — só que **ainda parcial** (`where platform_user_id is not null`, copiado da 009), o que se mostrou insuficiente (ver 011 abaixo). **Necessária, mas não suficiente sozinha** — aplique junto com a 011. **Idempotente.**
- `011_connection_purpose_unique_index_not_partial.sql` — mesmo com o índice da 010 existindo, o `upsert` continuava com `42P10`. Causa: o Postgres só usa um índice único **parcial** como "arbiter" de um `ON CONFLICT (colunas)` quando a própria cláusula repete o predicado (`ON CONFLICT (colunas) WHERE ...`) — e o PostgREST/supabase-js (`onConflict: 'platform_user_id,open_id,connection_purpose'` em `lib/tiktok/token-store.ts`) não tem como expressar esse predicado, só uma lista de colunas. Confirmado com upsert real contra produção (descartado em seguida — nenhuma linha real foi tocada). Esta migration troca o índice por um **não parcial** nas mesmas 3 colunas — checando antes que não há duplicatas (`do $$ ... having count(*) > 1 ... raise exception`, não apaga nada) e sem risco pelas linhas com `platform_user_id` nulo (unicidade do Postgres já trata `NULL` como distinto de qualquer outro `NULL`, com ou sem `WHERE`). **Necessária antes de qualquer nova autorização (Bestsellers ou Minha loja) funcionar.** **Idempotente.** Lição: ao verificar se uma migration "pegou", confira as constraints/índices que ela cria (e se são parciais) — não só as colunas. `tests/tiktok-connection-unique-index.test.ts` cobre os dois incidentes (índice ausente e índice parcial) e tem um teste de contrato que lê a definição efetiva do índice nas migrations e falha se ela voltar a ser parcial.

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
- `creators.test.ts` — página **Criadores**: avatar presente/ausente (adapter e provider), deduplicação (2 snapshots do mesmo criador colapsam num só, usando o mais recente), períodos (`1D`/`7D`/`30D`, inclusive período ainda não sincronizado → lista vazia), faixa de GMV (nunca inventa faixa faltando um limite) e ausência de vínculo com produto (`products` sempre `null`).
- `tiktok-own-shop-connection.test.ts` — **Minha loja**: separação entre `bestsellers_sync`/`own_shop` (reconectar uma não move nem apaga a outra, mesmo mesmo usuário/mesma conta TikTok), os 4 motivos distintos de falha do callback (`state_missing`/`state_invalid`/`state_expired`/`no_code`), expiração explícita do `state` (não só o `maxAge` do cookie), confirmação de escopo (`resolveOwnShopState` nunca marca "pronta" sem o escopo `data.shop_analytics.public.read` E token não vencido) e a garantia de que "Minha loja" nunca herda o `shop_cipher` estático de outra loja quando a API não confirma a autorização.
- `tiktok-connection-unique-index.test.ts` — regressão dos dois incidentes de 2026-09-13: índice ausente (coluna criada, índice não) e índice parcial (índice existe, mas com `WHERE` — nunca serve de arbiter pro `onConflict` do PostgREST). Simula os erros reais `42P10` do Postgres nos dois casos, confirma que `save()` falha de forma clara e que só um índice único NÃO parcial resolve; mais um teste de contrato que lê a definição efetiva do índice nas migrations 009-011 e falha se ela voltar a ser parcial ou a divergir do `onConflict` do código.
- `create-own-shop-client.test.ts` — o diagnóstico de análises da loja nunca usa a conexão `bestsellers_sync`: mesmo com as duas presentes para o mesmo usuário (inclusive a mesma conta TikTok), sempre lê `own_shop`; token vencido nunca chega a montar um client; sem conexão do usuário, `not_connected`.
- `shop-analytics.test.ts` — parsing das respostas reais documentadas das duas versões (202509/202605) das duas APIs de performance da loja: `creator` só populado na 202605 e nunca "vazado" por acaso numa leitura em modo 202509; `overall_performance` (202509) vs `total_performance`+`channelsWithData` (202605) nunca misturados; diferença de formato de `click_through_rate` entre versões preservada como string opaca; classificação dos 3 códigos de erro de negócio confirmados (`105005`/`105002`/`28001022`); paginação (segue `next_page_token`, para no limite de segurança, resposta vazia não lança, `seedPage` reaproveita a 1ª página já buscada pelo fallback de versão); janela de datas padrão (nunca hoje/futuro).
- `shop-analytics-service-fallback.test.ts` — o fallback automático 202605→202509: usa 202605 quando ela responde; cai para 202509 só nos 2 sinais confirmados de versão indisponível (`36009009`, ou `36009014`/`36009004` com "Invalid API version" na mensagem); erro de negócio (ex.: período inválido) nunca aciona o fallback, propaga na hora; se as duas versões falharem por indisponibilidade, propaga o erro da última tentativa.

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

### Novos no radar (`/new-in-radar`)

Identifica produtos com potencial de venda: primeira aparição real (por `product_id`, em todo o histórico — não só a sincronização mais recente) nos últimos 7 dias **e** GMV 7D (limite inferior da faixa) de pelo menos R$ 10 mil. Regras puras e testadas em `lib/scoring/new-in-radar.ts` (`tests/new-in-radar.test.ts`, 27 casos: limites exatos de R$ 10 mil/20 mil/50 mil/100 mil, virada de dia/fuso, data no futuro, ISO inválido, período≠7D, moeda≠BRL, faixa invertida, `raw_payload` sem `gmv_range`, drift entre o gravado e o bruto). Consulta em `TikTokShopProvider.getNewInRadar()` (`lib/providers/tiktok-shop-provider.ts`).

- **"Detectado pelo TikRadar em [data]"** — nunca chamado de "lançamento" ou "cadastro na TikTok": é `products.created_at`, o instante da 1ª linha gravada para aquele `product_id` (confirmado em 2026-09-12 comparando com `min(product_snapshots.captured_at)` em produção — bate em todos os casos verificados, porque o upsert de sincronização nunca reescreve `created_at` de um produto já existente). O produto pode existir na TikTok Shop há mais tempo — a UI deixa isso explícito.
- **Confiabilidade do GMV**: antes de classificar um produto numa faixa, `checkGmvReliability` confirma no `raw_payload` bruto (não só nas colunas já calculadas) que o snapshot é do período `7D`, que a moeda do `gmv_range` é `BRL` (o texto real vem como `"BRL638343.60~BRL1067572.58"` — a moeda está embutida na própria string) e que `gmv_min`/`gmv_max` batem com uma nova análise desse texto. Produto que falha em qualquer checagem **não aparece** na página — o motivo vai só para `console.error` do servidor (nunca ao cliente, nunca com o `raw_payload` exposto).
- **Faixas**: R$ 10 mil–<20 mil / R$ 20 mil–<50 mil / R$ 50 mil–<100 mil / R$ 100 mil+, mutuamente exclusivas pelo limite inferior (`classifyGmvTier`). O card mostra a faixa ORIGINAL (`gmv_min`–`gmv_max`), nunca o ponto médio, com a nota "Classificação conservadora baseada no limite inferior do GMV informado pelo TikTok".
- **Evolução**: "Crescimento confirmado" só aparece com 2+ snapshots 7D comparáveis do mesmo produto E (ranking melhorou OU GMV cresceu) — reaproveita `growthBetween`/`groupSnapshotsByEntity`, já usados e testados no resto do app (Opportunity Score não foi alterado). Com 1 snapshot só, mostra "Histórico insuficiente", nunca um crescimento inventado.
- **Preço, quantidade vendida, comissão e nº de criadores** aparecem explicitamente como "Não informado" quando ausentes — nunca omitidos nem tratados como zero.
- **Miniatura clicável**: mesma regra de `Product.productUrl` — só abre a página real do produto quando a API retornar um campo de link de verdade. **Checagem real em produção (2026-09-12): os 112 produtos hoje elegíveis não têm esse campo — nenhuma miniatura abre link ainda.**
- **Por que hoje aparecem muitos produtos**: a sincronização desta conta começou há poucos dias, então boa parte do catálogo tem `created_at` recente — é esperado, e a lista se restringe naturalmente a produtos genuinamente novos conforme mais tempo passa.
- Consulta eficiente: filtra `products` por `created_at` no próprio Supabase (nunca traz o catálogo inteiro para o servidor) e só busca `product_snapshots` dos candidatos já filtrados — ver migration `007`.

### Criadores (`/creators`)

Lê `creators` + `creator_snapshots` (`TikTokShopProvider.getCreators`). Nome, identificação (`username`), posição no ranking, período consultado e faixa de GMV só aparecem quando o snapshot mostrado realmente os tem — nunca um valor calculado ou "zerado" na ausência do dado.

- **Filtros de período (1D/7D/30D)**: a UI oferece as 3 abas porque a integração já suporta os 3 (`time_slot` na chamada real, ver `services/tiktok/bestsellers-service.ts`) — mas **hoje só o período `7D` foi de fato sincronizado** nesta conta (confirmado consultando `creator_snapshots` em produção em 2026-09-12: 100% das linhas têm `period='7D'`). Selecionar 1D/30D mostra o estado vazio explicando isso, nunca um erro genérico nem dado de outro período.
- **Foto de perfil**: `creators.avatar_url` (migration `008`) existe pronta para quando a API retornar isso — inspecionando o `raw_payload` real de 500 `creator_snapshots` em 2026-09-12, o item de `creators` só traz `rank, open_id, gmv_range, nick_name, user_name, likes_count, followers_count`, sem nenhum campo de foto. Por isso hoje **todo criador** aparece com um avatar neutro (iniciais do nome) — nunca uma foto genérica ou de outro criador. Se um campo real de imagem aparecer numa sincronização futura, o mapeamento já está pronto em `avatarUrlFrom` (`services/tiktok/adapters.ts`) e a URL é usada diretamente (mesma CDN de imagem já usada nas miniaturas de produto — não precisa de assinatura/proxy).
- **GMV é uma faixa**, nunca um valor exato: a tabela mostra `gmvRangeMin`–`gmvRangeMax` (a faixa original recebida), com o ponto médio reservado só para ordenar/calcular crescimento.
- **Ranking limitado**: o Bestsellers retorna um recorte de criadores em destaque no período, não a totalidade de criadores ativos no TikTok Shop — texto explícito na página.
- **Relação criador↔produto**: investigada nos payloads reais de produtos, criadores, vídeos e lives — nenhum deles carrega um ID em comum entre criador e produto (`product_infos` de vídeos só tem `product_id`, sem `creator_id` no mesmo item; `creator_name`/`creator_nick_name` de lives são texto livre, sem ID). Por isso a coluna "Produtos" da tabela de criadores é sempre "Não informado": o TikRadar nunca conta produtos distintos por criador associando por nome parecido ou suposição.

### Minha loja (`/admin/integrations/tiktok`) — 1ª etapa: só autorização

Permite que o usuário autorize a **própria** conta de vendedor TikTok Shop (fluxo oficial de Seller Authorization), separado da conexão que alimenta o Bestsellers. Esta etapa só prova a autorização (identifica a loja e confirma permissões) — **não sincroniza métricas nem tem painel de análise ainda**.

**Por que uma coluna nova (`connection_purpose`) foi necessária**: `tiktok_connections` já guardava a conexão que alimenta a sincronização de dados públicos Bestsellers. Antes desta migration, `TikTokShopProvider`/`createTikTokSyncService` liam "a conexão mais recente deste usuário" sem filtrar por propósito — se o mesmo usuário (o admin) autorizasse "Minha loja" depois, essa nova conexão passaria a ser "a mais recente" e seria lida por engano pela sincronização Bestsellers. `connection_purpose` (`'bestsellers_sync'` | `'own_shop'`) elimina essa ambiguidade: toda leitura/escrita em `lib/tiktok/token-store.ts` agora exige o propósito explicitamente (ver `lib/tiktok/connection-purpose.ts` e `tests/tiktok-own-shop-connection.test.ts`).

**Mesma rota de callback, sem nova URL no Partner Center**: a TikTok Shop não aceita um `redirect_uri` por requisição — só o fixo já cadastrado no app. Por isso "Minha loja" reaproveita exatamente `/api/tiktok/oauth/authorize` e `/api/tiktok/oauth/callback` (o botão só acrescenta `?purpose=own_shop`, guardado num cookie httpOnly de curta duração ao lado do `state`); **nenhuma URL nova precisa ser cadastrada**.

- **Fluxo**: `/admin/integrations/tiktok` → botão "Conectar loja" (`/api/tiktok/oauth/authorize?purpose=own_shop`) → tela de consentimento da própria TikTok Shop (nunca pedimos usuário/senha do TikTok dentro do TikRadar) → `/api/tiktok/oauth/callback` troca o código por tokens no servidor, confirma a loja chamando `GET /authorization/202309/shops` com o access_token recebido (nunca aceita a loja "de outra fonte" para este propósito — ver `resolveConfirmedShop`) e só então salva a conexão, criptografada, com `connection_purpose='own_shop'`.
- **`state` do OAuth**: comparado a um cookie httpOnly (CSRF) e com expiração validada explicitamente a partir do instante embutido no próprio valor (`lib/tiktok/oauth-state.ts`), não só o `maxAge` do cookie — 4 motivos de falha distintos (`state_missing`, `state_invalid`, `state_expired`, `no_code`), cada um com mensagem própria (nunca um "callback inválido" genérico).
- **Permissão `data.shop_analytics.public.read`**: gravada a partir de `granted_scopes` retornado pela própria TikTok Shop na troca do código — nunca assumida por estar "ativa" no Partner Center nem por existir um token antigo. `resolveOwnShopState` (`lib/tiktok/connection-purpose.ts`) só marca a loja como "pronta" (`ready`) quando o token não está vencido **e** o escopo está de fato no `granted_scopes` gravado; caso contrário mostra "permissão ainda não confirmada" (token vencido) ou "autorizada — permissão ainda não confirmada" (token válido, sem o escopo). Confirmado em produção em 2026-09-13: a única conexão hoje tem `granted_scopes=["seller.authorization.info","data.bestselling.public.read"]` — **sem** `data.shop_analytics.public.read` — então a permissão de análise segue não confirmada até uma reconexão que a conceda.
- **Nunca mostra "Conectado" cedo demais**: cancelamento, `state` inválido/expirado, token recusado, tipo de conta que não é Seller (`user_type≠0`), ou loja não confirmada pela API — todos impedem a gravação da conexão e voltam para `/admin/integrations/tiktok?purpose=own_shop&error=<código>` com uma mensagem específica (`lib/tiktok/oauth-messages.ts`).
- **Segredos**: access token, refresh token e App Secret nunca saem do servidor — os tokens são criptografados (AES-256-GCM) antes de gravar em `tiktok_connections`, a tabela tem RLS com todo acesso revogado de `anon`/`authenticated` (só service role no servidor lê/escreve), e a página só exibe o `shop_cipher` mascarado (`••••XXXX`).
- **Só testável com Development/Sandbox Shop por enquanto**: este app TikTok Shop está em rascunho no Partner Center. A única conexão já existente no projeto (a do Bestsellers) é contra uma loja chamada `SANDBOX_BR...` — confirmado consultando `tiktok_connections` em produção. Enquanto o app não for revisado/publicado (ou a loja real não for cadastrada como testadora no Partner Center), "Minha loja" só autoriza contra esse tipo de loja de teste — o TikRadar não promete, e esta implementação não tenta simular, uma conexão com uma loja real antes disso.
- **Desconectar**: botão próprio na "Minha loja", que só chama `DELETE /api/tiktok/connection?purpose=own_shop` — nunca apaga a conexão do Bestsellers (a rota agora exige `?purpose=` explícito, sem padrão implícito).

#### Diagnóstico de leitura das análises da loja (`/admin/integrations/tiktok/shop-analytics-diagnostic`)

Ferramenta **só de leitura** para confirmar que dá pra ler as métricas da própria loja com o token de "Minha loja" — **não é o painel/dashboard de análises** (não existe ainda) e **não grava nada no banco** (nem em `product_snapshots`/`creator_snapshots`, nem em nenhuma tabela nova).

- **Duas versões por endpoint, com fallback automático** — a primeira investigação (2026-09-13) concluiu, errado, que a versão `202605` "não existe" por ela não aparecer nos resultados de busca; **não é verdade**. Baixando o Markdown oficial de cada página (botão "Download Markdown" do Partner Center — dá o texto completo, sem o corte que o editor de código renderizado em JS causa nas primeiras linhas visíveis) e o changelog da atualização (`partner.tiktokshop.com/docv2/page/kpkfccsa`), confirmamos que `202605` é real, atual, e que `202509` é a versão anterior imediata dos dois endpoints (havia também uma `202405` de produto, duas gerações mais antiga — fora de uso aqui, já que a doc oficial só reconhece 202509 como "a versão anterior" de 202605). O seletor de versões da ferramenta de teste do Partner Center só mostra o que está habilitado *para este app específico* — não é prova de que uma versão documentada não existe, só de que este app ainda não a usa. Por isso o serviço **tenta 202605 primeiro e só cai para 202509** quando a própria TikTok responde que a versão/rota é inválida (`36009009` "Invalid path" ou `36009014`/`36009004` com "Invalid API version" na mensagem — nunca por qualquer outro motivo, como período inválido) — ver `isVersionUnavailableError`/`fetchFirstShopVideoPageWithFallback`/`fetchFirstShopProductPageWithFallback` em `lib/tiktok/shop-analytics.ts`/`services/tiktok/shop-analytics-service.ts`. **A versão que respondeu de fato aparece no diagnóstico**, nunca escondida.
  - `GET /analytics/{202605|202509}/shop_videos/performance` — **Get Shop Video Performance List**. A `202605` acrescenta `creator{open_id,user_name,nick_name,author_type}` — é a identificação de criador que a `202509` não tem. Os outros campos são iguais nas duas: `id, title, username, video_post_time, duration, hash_tags[], gmv{amount,currency}, gpm{amount,currency}, avg_customers, sku_orders, items_sold, views, click_through_rate, products[{id,name}]`, mais `latest_available_date, next_page_token, total_count` em `data`. **Atenção**: o formato de `click_through_rate` diverge entre versões no próprio exemplo oficial (`"12.5%"` na 202509, `"0.0528"` decimal na 202605, com a mesma descrição de campo nas duas — inconsistência da documentação, não nossa) — por isso o valor é sempre tratado como string opaca, nunca reformatado/recalculado.
  - `GET /analytics/{202605|202509}/shop_products/performance` — **Get Shop Product Performance List**. A `202509` só traz `overall_performance{gmv,orders,items_sold}`. A `202605` substitui isso por `total_performance` (funil completo: impressões, cliques, CTR, add-to-cart, reembolsos...) **mais 7 blocos de performance por canal** (`seller_live_performance`, `seller_video_performance`, `seller_product_card_performance`, `affiliate_total_performance`, `affiliate_live_performance`, `affiliate_video_performance`, `shop_tab_performance` — dezenas de métricas ao todo). O diagnóstico não achata os ~80 campos desses blocos um a um: mostra `total_performance` tipado (GMV, pedidos, itens vendidos, impressões, cliques, CTR) e **quais blocos de canal vieram com dado** (`channelsWithData`) — os nomes de campo reais de cada item continuam expostos via `observedFields`. **A API de produto nunca traz identificação de criador, em nenhuma versão** — só a de vídeo traz.
  - As duas exigem `data.shop_analytics.public.read`, header `x-tts-access-token` (seller, `user_type=0`) e `shop_cipher` na query — a assinatura é a mesma HMAC já usada pelo resto do app (`lib/tiktok/signature.ts`/`TikTokShopClient`), sem nada novo a implementar aí; os parâmetros de query são idênticos entre `202509`/`202605` nos dois endpoints (só o path/versão muda).
  - `lib/tiktok/shop-analytics.ts` só lê os campos de cada versão com segurança (nunca lança por um campo secundário ausente) e também expõe os nomes de campo **realmente recebidos** (`observedFields`), separado do que o diagnóstico decide mostrar — e nunca mistura campo de uma versão com o de outra (`toVideoSummary`/`toProductSummary` recebem a versão explicitamente).
- **Conexão usada**: exclusivamente `own_shop` do admin autenticado (`services/tiktok/create-own-shop-client.ts`) — nunca cai de volta no `shop_cipher`/token do Bestsellers, e nunca chama a API com um token já vencido (checa `access_token_expires_at` antes de qualquer chamada).
- **Período consultado**: `lib/tiktok/shop-analytics-window.ts` pede uma janela conservadora (7 dias terminando 2 dias atrás, no fuso da região da loja) — nunca uma data futura, e reaproveita `computeReferenceDate` (já testado para o Bestsellers). O período realmente usado e o `latest_available_date` que a própria TikTok devolve aparecem no diagnóstico.
- **Paginação**: segue `next_page_token` até 3 páginas de 100 registros (`DIAGNOSTIC_MAX_PAGES`) — um diagnóstico não deve virar uma varredura completa do catálogo; se houver mais páginas, o resultado avisa que foi truncado.
- **6 estados tratados separadamente** (`lib/tiktok/shop-analytics.ts` + a rota): `not_connected`, `token_expired` (checados antes de qualquer chamada), `success_with_data`, `success_empty`, `insufficient_permission` (código `105005`), `invalid_period` (código `28001022`) e `api_error` (qualquer outro código/status, mostrado tal como a TikTok respondeu). Os 3 códigos numéricos vêm da página oficial "common error codes" (`partner.tiktokshop.com/docv2/page/678e3a45786253031531b942`) e do Error Code de cada endpoint — nenhum foi inferido.
- **Nunca expõe segredo**: a rota (`app/api/admin/tiktok/shop-analytics-diagnostic/route.ts`) só devolve status, contagens, o período consultado, os nomes de campo recebidos e uma amostra pequena (até 3 itens) dos campos já tipados — nunca o payload bruto, nunca token/App Secret. Admin-only (`getSessionProfile().role==='admin'`).

Ver também `lib/providers/provider-factory.ts`, `docs/security/` e as páginas `/privacy`, `/security`, `/data-requests`.

Nunca preencha ou compartilhe `.env.example`. Copie-o para `.env.local`, preencha apenas localmente e mantenha fora do controle de versão.
