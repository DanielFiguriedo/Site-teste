# Minecraft server store

A Brazilian-Portuguese storefront where a Minecraft server owner sells VIP ranks,
cash, kits/items and crate keys. Payment is **Pix** (Mercado Pago), confirmed
automatically by webhook. **Delivery is manual**: paid orders land in a queue in
the admin panel, and the owner marks each one delivered after handing the item
over in game.

Everything runs inside **a single Cloudflare Worker** — the React front-end is
served as static assets and the Hono API answers `/api/*` from the same deploy.

## Language policy

**Code is English. Content is Portuguese.**

- English: identifiers, comments, file names, commit messages, tests, database
  tables and columns, API routes, docs.
- Portuguese: anything a user reads — UI copy, error messages returned by the
  API, seed data, product names, store settings. The audience is Brazilian.

Slugs that come from content (`vip`, `chaves`, `vip-ouro-30-dias`) stay
Portuguese: they are data, not code.

## Commands

```bash
npm run dev              # Vite + workerd (the real Worker runtime)
npm test                 # 204 tests, unit + integration + attacks, in workerd
npm run typecheck
npm run build

npm run db:migrate:local # apply migrations to the local D1
npm run db:seed:local    # sample data
npm run db:generate      # generate a migration from the Drizzle schema
npm run admin:create     # print the SQL that creates an admin user
npx wrangler types       # regenerate worker-configuration.d.ts
```

## Non-negotiable conventions

**Money is always an integer number of cents.** Never a float, in any layer —
database, API or UI. `R$ 29,90` is `2990`. Formatting happens only at the edge,
through `formatBRL()` in `src/shared/money.ts`.

**The price never comes from the client.** Checkout accepts a product slug and a
quantity; the Worker re-reads the price from D1 and computes the total. Accepting
a value sent by the browser is the number one security hole in this kind of
store, and there is a test that pins it.

**Secrets never live in the repository.** `.dev.vars` locally (gitignored) and
`wrangler secret put` in production. Nothing sensitive in `wrangler.jsonc`.

**Sales history is immutable.** `order_items` stores the name and price at
purchase time. Changing a product's price must not rewrite past sales.

**Every admin route is guarded server-side.** Hiding a screen in the front-end
protects nothing. One `app.use("/api/admin/*")` in `index.ts` guards the whole
panel, with login and logout as the two named exceptions — never a per-router
guard, which depends on mount order and on the next router remembering.
`src/worker/routes/admin/admin.test.ts` keeps a list of every protected route —
add to it whenever you add a route.

**Every state-changing request checks its `Origin`.** `requireSameOrigin` runs
on all of `/api/*` except the webhook, which the gateway calls with no origin
and authenticates by HMAC instead. `SameSite=Strict` alone does not cover a
sibling subdomain.

**Nothing coming out of R2 keeps the content type it was stored with.** The
image route decides the type from the key, and the upload decides the format
from the file's own magic bytes. See `.claude/skills/security/`.

## Architecture

```
src/worker/    Hono API, D1 access and the payment integration
  routes/      catalog, checkout, orders, webhook, admin/*
  payments/    provider.ts (the contract) + swappable implementations
  lib/         orders (state machine), auth, serializers, errors
  db/          Drizzle schema + client
src/shared/    types and helpers used by both sides
src/app/       React: storefront, checkout, payment
  admin/       the panel
  styles/      design tokens
src/test/      setup and helpers for the integration tests
```

The front-end talks to the API only through `src/app/lib/api.ts`. No component
calls `fetch` directly.

## Runtime

This is Workers, not Node: no `fs`, no `path`, no `Buffer` outside
`nodejs_compat`. Cryptography is `crypto.subtle` (WebCrypto). Work that outlives
the response goes in `ctx.waitUntil()`.

## Testing

Tests run inside `workerd` with real D1 and KV (`@cloudflare/vitest-pool-workers`),
against the same migrations that ship to production. Pure logic is unit tested;
everything else goes through the actual HTTP routes.

State is wiped between tests in `src/test/setup.ts` — storage is isolated per
file, not per test, so without that a suite would pass alone and fail together.

## Documentation for the owner

`docs/` holds the Portuguese documentation the server owner reads, illustrated
with a screenshot of every screen: a tour of the system, a deployment
walkthrough (Cloudflare plus the Mercado Pago integration) written for someone
who does not program, the security explanation, the code structure and the
day-to-day routine.

A change that alters a screen, a deploy step or a security guarantee has to be
reflected there — including a fresh screenshot when the screen itself changed.

## Project skills and agents

- `.claude/skills/design-system/` — tokens, components and visual rules.
  **Read before creating or changing any screen.**
- `.claude/skills/payments-pix/` — the provider contract, the order state machine
  and the security rules of the payment flow.
- `.claude/skills/cloudflare-worker/` — bindings, migrations, secrets, deploy.
- `.claude/skills/testing/` — how the test suite is organised and what a new
  feature is expected to cover.
- `.claude/skills/security/` — threat model, hardening rules and how to write
  an attack test. **Read before touching auth, admin routes, uploads, the
  webhook or headers.**
- Agent `ui-reviewer` — reviews screens against the design system and a11y.
- Agent `payment-auditor` — audits changes to the payment flow.
- Agent `security-auditor` — audits the whole attack surface; run it before a
  deploy.
