---
name: cloudflare-worker
description: This project's Worker patterns — bindings, D1 migrations, R2, KV, secrets, local dev and deploy. Use when touching wrangler.jsonc, the database schema, image upload, or when publishing.
---

# The store Worker

Front-end and API live in the same Worker. `wrangler.jsonc` points
`assets.directory` at the Vite build, with `not_found_handling:
"single-page-application"` and `run_worker_first: ["/api/*"]` — without the
latter the SPA would swallow the API routes.

## Bindings

| Binding | What | For |
|---|---|---|
| `DB` | D1 (SQLite) | Catalog, orders, settings, admin users |
| `BUCKET` | R2 | Product images uploaded from the panel |
| `SESSIONS` | KV | Admin session revocation, and simulated charges in dev |

Types live in `src/worker/env.ts`. After changing `wrangler.jsonc`, run
`npx wrangler types`.

## Runtime — what does not exist

This is `workerd`, not Node. No `fs`, no `path`, no disk. Cryptography is
`crypto.subtle` (WebCrypto): PBKDF2 for passwords, HMAC-SHA256 for the session
cookie and webhook signatures. Work that outlives the response goes in
`ctx.waitUntil()`.

One consequence worth remembering: a `fetch` from the Worker to its own public
URL is a real subrequest and does **not** loop back in tests. That is why the
test helper posts webhooks directly instead of going through
`/api/dev/simulate-payment`.

## Database (D1 + Drizzle)

The schema is the source of truth: edit `src/worker/db/schema.ts` and generate
the migration. Never hand-write SQL in `migrations/`.

```bash
npm run db:generate        # generate a migration from the schema
npm run db:migrate:local   # apply it to the local D1
npm run db:seed:local      # sample data
```

Indexes matter: the free tier bills per **row read**, and a full scan of `orders`
burns through the quota quickly. Every column used in a `where` has an index.

Column and table names are English; the values stored in them (product names,
settings) are Portuguese, because they are content.

## Local development

```bash
npm run dev    # http://localhost:5173, with a real workerd
```

Local secrets go in `.dev.vars` (gitignored). The cron can be triggered with
`curl http://localhost:5173/cdn-cgi/handler/scheduled`.

If the app suddenly renders blank while the API still answers, check for a stale
`vite` process holding the port: the new server silently moves to 5174 and the
browser keeps talking to the old one.

## Deploying

Requires access to the server owner's Cloudflare account. In order:

```bash
npx wrangler d1 create loja-minecraft          # copy the id into wrangler.jsonc
npx wrangler r2 bucket create loja-minecraft-images
npx wrangler kv namespace create SESSIONS      # copy the id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
npx wrangler secret put SESSION_SECRET
npm run deploy
```

No secret ever goes into `wrangler.jsonc` — it is committed. The Turnstile
**public** key is the exception: it ships in the HTML anyway, so it lives in
`vars`.
