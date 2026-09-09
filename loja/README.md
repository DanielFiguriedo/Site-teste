# Minecraft server store

A storefront in Brazilian Portuguese where a Minecraft server owner sells VIP
ranks, cash, kits/items and crate keys. Payment is **Pix**, confirmed
automatically.

Delivery is **manual**: once the Pix clears, the order joins a queue in the admin
panel and the owner marks it delivered after handing the item over in game. That
is stated plainly to the buyer on the home page, the product page, checkout and
the payment screen — hiding it would only move the frustration to support.

Everything runs inside **one Cloudflare Worker**: the front-end (React + Vite) is
served as static assets and the API (Hono) answers `/api/*` from the same deploy.

The code is English; everything a user reads is Portuguese. See `CLAUDE.md` for
the full convention.

---

## Running it locally

Requires Node 20 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars     # adjust if you like
npm run db:migrate:local           # create the tables in the local D1
npm run db:seed:local              # sample products
npm run dev                        # http://localhost:5173
```

To sign in to the panel, create a user:

```bash
npm run admin:create -- you@example.com "a-strong-password"
# copy the printed SQL and run it:
npx wrangler d1 execute loja-minecraft --local --command "<the SQL>"
```

Then open `http://localhost:5173/admin`.

In development the payment provider is the **simulated** one: the payment screen
gets a "simulate payment" button that posts a signed webhook to the real
endpoint. It exists because Mercado Pago's sandbox **cannot actually pay a Pix
charge** — without it there would be no way to exercise the whole flow before
going live.

---

## Tests

```bash
npm test           # 155 tests
npm run test:watch
npm run typecheck
```

Tests run inside the real Workers runtime (`workerd`) with real D1 and KV, against
the same migrations that ship to production. That is deliberate: unit tests over
pure logic cannot catch a broken SQL query, a missing migration or an auth
middleware that stopped guarding a route — which is exactly what breaks when a
feature is added.

| Layer | What it covers |
|---|---|
| Unit | money arithmetic, slugs, the order state machine, HMAC signatures, password hashing |
| Catalog | active-only listing, filters, product lookup, store settings |
| Checkout | server-side pricing, forged prices, stock, pay-what-you-want, gifting, per-IP limit |
| Webhook | signature, tampered body, idempotency, wrong amount, payment after expiry |
| Orders | public payload, what must not leak, Pix code lifetime |
| Admin | every protected route without a session, CRUD, delivery queue, transitions, upload |
| Cron | expiry only after asking the gateway, lost-webhook recovery, ordering |

---

## Deploying to Cloudflare

You need access to the server owner's Cloudflare account. The free tier covers
all of this comfortably (D1: 5 GB, 5 million reads/day).

### 1. Create the resources

```bash
npx wrangler login

npx wrangler d1 create loja-minecraft
npx wrangler r2 bucket create loja-minecraft-images
npx wrangler kv namespace create SESSIONS
```

Each command prints an `id`. Copy them into `wrangler.jsonc`, where the
`FILL_IN_...` placeholders are.

### 2. Prepare the database

```bash
npm run db:migrate:remote
npm run admin:create -- owner@server.com "a-genuinely-strong-password"
npx wrangler d1 execute loja-minecraft --remote --command "<the printed SQL>"
```

### 3. Configure the secrets

None of these belong in `wrangler.jsonc`, which is committed:

```bash
npx wrangler secret put SESSION_SECRET              # a long random string
npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY        # optional, anti-bot
```

For Turnstile, also set the **public** key in `wrangler.jsonc` under
`vars.TURNSTILE_SITE_KEY`. Leaving it empty disables the widget.

### 4. Publish

```bash
npm run deploy
```

### 5. Point the webhook at the store

In the Mercado Pago dashboard, under **Your integrations → Webhooks**, point it
at:

```
https://<your-domain>/api/webhook/pix
```

Subscribe to the **Payments** event. The dashboard generates a **secret key** —
that is what goes into `MERCADOPAGO_WEBHOOK_SECRET`. Note it is **not** the
access token; they are two different things, and swapping them makes every
webhook get rejected.

### 6. Final check

Mercado Pago's sandbox cannot pay a Pix charge, so the last test is a real one:
create a **R$ 0,01** product, buy it, pay it, confirm the order shows up as paid
in the panel, then deactivate the product.

---

## Where to change what

```
src/worker/          API, database and payment
  routes/            catalog, checkout, orders, webhook, admin/*
  payments/          provider.ts (contract) + mercadopago.ts + mock.ts
  lib/orders.ts      state machine, order creation, reconciliation
  db/schema.ts       source of truth for the database (generate migrations,
                     never hand-write SQL)
src/shared/          types and helpers used by both sides
src/app/             React: storefront, checkout, payment
  admin/             the panel
  styles/theme.css   design system (tokens)
src/test/            setup and helpers for the integration tests
```

Conventions live in `CLAUDE.md`; the details are in `.claude/skills/`.

---

## Deliberately out of scope

- **Automatic in-game delivery.** Not part of this version. When it arrives, the
  natural hook is the moment an order becomes `paid` (`markAsPaid`, in
  `src/worker/lib/orders.ts`).
- **A multi-product cart.** Today one order carries one product. The database
  already supports several items (`order_items`), so it is a UI change.
- **Other payment methods.** Pix only, as requested. Swapping or adding a gateway
  means implementing `PaymentProvider` in one new file.

---

## Legal note

Not affiliated with Mojang AB or Microsoft. Fill in the Terms of Use and the
Refund Policy in the panel before selling: in Brazil the consumer code grants a
7-day right of withdrawal on distance purchases.
