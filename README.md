# TikRadar

MVP de inteligência de mercado para TikTok Shop. O produto identifica itens em aceleração, compara saturação e ajuda afiliados, vendedores e agências a chegarem antes das tendências.

## Stack e arquitetura

Next.js App Router (padrão, compatível com Vercel), React, TypeScript, Tailwind CSS, Lucide, Recharts, Zod, React Hook Form e Supabase (Auth + PostgreSQL). As telas consomem `ProductDataProvider`; nenhum componente conhece a origem dos dados. Nesta versão, `MockTikTokProvider` fornece 100 produtos, 30 lojas, 100 criadores e 300 vídeos realistas.

## Rodando localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`. Sem variáveis do Supabase, a aplicação segue funcional com dados mockados.

## Supabase

1. Crie um projeto Supabase e copie URL e chaves para `.env.local`.
2. Execute, em ordem, os arquivos de `supabase/migrations/` pelo CLI ou SQL Editor.
3. Configure os Redirect URLs da autenticação para o domínio local e o domínio final.

A migration cria entidades de catálogo, snapshots históricos, relacionamentos e dados privados. RLS restringe `users`, `favorites`, `alerts` e `watchlists` ao proprietário autenticado.

## Autenticação

A autenticação usa Supabase Auth (`@supabase/ssr`) via cookies HTTP-only, com sessão renovada pelo `middleware.ts` a cada requisição. `/login` autentica com email/senha; `/onboarding` cria a conta (`supabase.auth.signUp`) antes de coletar preferências. Rotas administrativas e a API `/api/tiktok/*` exigem sessão válida — veja `lib/auth/session.ts`.

## Scores

O Opportunity Score fica em `lib/scoring/opportunity-score.ts`: aceleração (30%), crescimento de GMV (20%), novos criadores (15%), novos vídeos (10%), comissão (10%), concorrência (10%) e atratividade do ticket (5%). Todos os sinais são normalizados de 0 a 100.

O Saturation Score fica em `lib/scoring/saturation-score.ts` e combina criadores, vídeos, vendedores, eficiência de vendas por criador e entrada recente de novos criadores. `lib/scoring/acceleration.ts` compara as últimas 24h, blocos de 3 dias e blocos de 7 dias para produzir crescimento, aceleração e momentum.

## Troca do provider

Defina `TIKTOK_DATA_PROVIDER=mock` para dados demonstrativos ou `TIKTOK_DATA_PROVIDER=tiktok` para a infraestrutura oficial. A seleção acontece em `lib/providers/provider-factory.ts`; componentes React não conhecem a origem dos dados. O modo TikTok só deve ser ativado depois de configurar credenciais reais, migrations, autorização de Seller, shop cipher e o adapter validado com uma resposta oficial.

## Estrutura

- `app/`: rotas, login e onboarding
- `components/`: shell, tabelas, Radar, gráficos e detalhes
- `lib/providers/`: abstração e mock provider
- `lib/scoring/`: Opportunity Score, saturação e aceleração
- `types/`: contratos tipados
- `supabase/migrations/`: schema PostgreSQL, índices e RLS

## Qualidade

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Sem credenciais reais, os dados exibidos continuam demonstrativos. Nenhum endpoint não oficial é utilizado.

## TikTok Shop Open API

Selecione a fonte com `TIKTOK_DATA_PROVIDER=mock` ou `TIKTOK_DATA_PROVIDER=tiktok`. O modo TikTok exige App Key, App Secret, access token de Seller, shop cipher e Supabase server-side. Em desenvolvimento, configuração incompleta faz fallback explícito para o mock; em produção, a aplicação falha de forma segura.

O OAuth de Seller começa em `/api/tiktok/oauth/authorize` e retorna por `/api/tiktok/oauth/callback`. Tokens nunca chegam ao navegador: são criptografados com AES-GCM usando `TIKTOK_TOKEN_ENCRYPTION_KEY` e gravados por service role. A sincronização manual usa `POST /api/admin/tiktok/sync` com o header `x-admin-sync-token`.

Os endpoints oficiais preparados são `/analytics/202511/{products|creators|videos|lives}/bestselling`, com `1D`, `7D` ou `30D` e `LOCAL` ou `USD`. O adapter permanece estrito até a primeira resposta oficial ser capturada no API Testing Tool do Partner Center; isso impede que campos sejam inventados. GMV concorrente é modelado somente como faixa e estimativa derivada.

Passos no Partner Center: criar/abrir o app, habilitar o escopo `data.bestselling.public.read`, cadastrar a Redirect URL, autorizar um Development Shop/Seller, obter o shop cipher pela API de lojas autorizadas e validar a primeira resposta Bestsellers no API Testing Tool.

## Segurança e privacidade

As páginas `/privacy`, `/security` e `/data-requests` documentam o tratamento de dados, os controles de segurança e o canal autenticado de solicitações. Os procedimentos internos versionados ficam em `docs/security/`. OAuth exige usuário autenticado e `state` de curta duração; tokens são criptografados com AES-256-GCM. A migration `003_security_privacy_controls.sql` adiciona solicitações de privacidade, auditoria mínima e o identificador da identidade da plataforma.

Antes de habilitar dados reais, execute todas as migrations, configure os segredos apenas no ambiente server-side e valide a região física dos provedores. A revogação local usa `DELETE /api/tiktok/connection` e deve ser acompanhada da revogação no TikTok Shop.

## Deploy na Vercel

Requisito recomendado: Node.js `22.13.0` ou superior e npm compatível.

1. Importe o repositório na Vercel — o framework Next.js é detectado automaticamente (`next build`/`next start`).
2. Em Project Settings → Environment Variables, cadastre todas as chaves de `.env.example` (Supabase, TikTok Shop) para os ambientes Production/Preview/Development.
3. Em Supabase, adicione a URL de produção da Vercel aos Redirect URLs de autenticação.
4. Faça o deploy. O `middleware.ts` renova a sessão Supabase em cada requisição; nenhum segredo (`SUPABASE_SECRET_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_TOKEN_ENCRYPTION_KEY`, `TIKTOK_ADMIN_SYNC_SECRET`) é exposto ao cliente.

Para validar alterações antes de subir:

```bash
npm install
npm run test
npm run typecheck
npm run lint
npm run build
```

Nunca preencha ou compartilhe `.env.example`. Copie-o para `.env.local`, preencha apenas localmente e mantenha esse arquivo fora do controle de versão.
