---
name: cloudflare-worker
description: Padrões do Worker deste projeto — bindings, migrations D1, R2, KV, secrets, dev local e deploy. Use ao mexer em wrangler.jsonc, no schema do banco, em upload de imagem, ou ao publicar.
---

# Worker da loja

Front e API no mesmo Worker. `wrangler.jsonc` aponta `assets.directory` para o
build do Vite, com `not_found_handling: "single-page-application"` e
`run_worker_first: ["/api/*"]` — sem isso, a SPA engoliria as rotas da API.

## Bindings

| Binding | O quê | Para quê |
|---|---|---|
| `DB` | D1 (SQLite) | Catálogo, pedidos, config, sessões de admin |
| `BUCKET` | R2 | Imagens de produto enviadas pelo painel |
| `SESSIONS` | KV | Revogação de sessão do admin |

Tipos em `src/worker/env.ts`. Depois de mexer no `wrangler.jsonc`, rode
`npx wrangler types`.

## Runtime — o que não existe

É `workerd`, não Node. Sem `fs`, sem `path`, sem acesso a disco. Criptografia é
`crypto.subtle` (WebCrypto): PBKDF2 para senha, HMAC-SHA256 para cookie de
sessão e assinatura de webhook. Trabalho depois da resposta vai em
`ctx.waitUntil()`.

## Banco (D1 + Drizzle)

O schema é a fonte da verdade: edite `src/worker/db/schema.ts` e gere a
migration, nunca escreva SQL na mão em `migrations/`.

```bash
npm run db:generate        # gera a migration a partir do schema
npm run db:migrate:local   # aplica no D1 local
npm run db:seed:local      # dados de exemplo
```

Índices importam: o free tier cobra por **linha lida**, e um full scan em
`pedidos` queima a cota rápido. Toda coluna usada em `where` tem índice.

## Dev local

```bash
npm run dev    # http://localhost:5173, com workerd de verdade
```

Segredos locais em `.dev.vars` (no `.gitignore`). O cron é testável com
`wrangler dev --test-scheduled` e
`curl "http://localhost:5173/cdn-cgi/local/scheduled?cron=*+*+*+*+*"`.

## Deploy

Precisa dos acessos da conta Cloudflare do dono do servidor. A ordem é:

```bash
npx wrangler d1 create loja-minecraft          # copie o id para wrangler.jsonc
npx wrangler r2 bucket create loja-minecraft-imagens
npx wrangler kv namespace create SESSIONS      # copie o id para wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
npx wrangler secret put SESSION_SECRET
npm run deploy
```

Segredo nenhum entra no `wrangler.jsonc` — ele é versionado.
