---
name: testing
description: How this project's test suite is organised and what a new feature is expected to cover. Use when adding or changing tests, when a test fails in a confusing way, or when adding a feature that touches money, auth or the database.
---

# Testing

Tests run inside the real Workers runtime (`workerd`) with real D1 and KV, via
`@cloudflare/vitest-pool-workers`, against the same migrations that ship to
production.

That is deliberate. Unit tests over pure logic cannot catch a broken SQL query, a
missing migration or an auth middleware that stopped guarding a route — which is
exactly what breaks when a feature is added.

```bash
npm test            # everything
npm run test:watch
npx vitest run src/worker/routes/checkout.test.ts   # one file
```

Test names and comments are English, like the rest of the code. Assertions about
user-facing strings quote the Portuguese text, because that is the content.

## Layout

| File | Covers |
|---|---|
| `src/shared/money.test.ts` | cents arithmetic and BRL formatting |
| `src/worker/lib/slug.test.ts` | slug generation, accents included |
| `src/worker/lib/order-state.test.ts` | every edge of the transition table |
| `src/worker/lib/auth.test.ts` | password hashing, and parity with the admin script |
| `src/worker/payments/mercadopago.test.ts` | signature, replay window, event parsing |
| `src/worker/routes/catalog.test.ts` | listings, filters, settings |
| `src/worker/routes/checkout.test.ts` | pricing, stock, gifting, per-IP limit |
| `src/worker/routes/webhook.test.ts` | signature, idempotency, wrong amounts |
| `src/worker/routes/orders.test.ts` | public payload and what must not leak |
| `src/worker/routes/admin/admin.test.ts` | auth, CRUD, delivery queue, upload |
| `src/worker/scheduled.test.ts` | expiry, lost-webhook recovery, ordering |

## Helpers

`src/test/helpers.ts` carries the whole vocabulary: `request()`, `seedCatalog()`,
`createOrder()`, `payOrder()`, `signIn()`, `runScheduled()`.

Two of them exist for a specific reason:

- **`request()` waits on `waitUntil`.** The webhook returns 200 immediately and
  credits in the background; a test that skipped the wait would assert on state
  that had not landed yet and pass or fail at random.
- **`payOrder()` builds and posts a signed webhook itself**, rather than calling
  `/api/dev/simulate-payment`. That route reaches the endpoint over the network,
  and such a subrequest does not loop back to the Worker under test.

## State between tests

Storage is isolated per test **file**, not per test. `src/test/setup.ts` therefore
wipes every table and every KV key in a `beforeEach`. Without it a suite would
pass in isolation and fail when run together — the confusing failure mode worth
recognising.

## What a new feature is expected to cover

- **Anything touching money**: the amount is recomputed on the server, and a
  client-supplied amount is ignored.
- **A new admin route**: add it to the `PROTECTED` list in `admin.test.ts`, which
  asserts a 401 without a session.
- **A new order status or transition**: extend `order-state.test.ts`; the table
  is the backbone that makes double delivery impossible.
- **Anything the buyer can see**: assert on the response shape, so a field is
  never leaked by accident.
- **A migration**: it runs automatically in the tests, so a schema change that
  breaks a query fails here rather than on deploy day.

## Known friction

The `workerd` bundled with the test pool lags behind the one Wrangler deploys
with, so `vitest.config.ts` pins a slightly older `compatibilityDate` for tests
only. Raise it whenever the pool ships a newer runtime.
