---
name: payments-pix
description: The payment provider contract, the order state machine and the security rules of the Pix flow (Mercado Pago). Use when touching checkout, the webhook, order status, cron reconciliation, or any code that handles money.
---

# Pix payments

Gateway: **Mercado Pago** (0.99% with no minimum, individual-CPF signup, plain
REST with a bearer token). The integration sits behind an interface so it can be
swapped.

## Rules that are not up for negotiation

**1. The price never comes from the client.**
Checkout accepts a product slug and a quantity. The total is recomputed in the
Worker from the price stored in D1. If a value from the browser is ever used, the
whole store can be bought for one cent. There is a test pinning this; do not
weaken it.

**2. Money is an integer number of cents** the whole way. Convert to decimal only
in the call to the gateway, through `centsToReais()`.

**3. The webhook body is read once, raw.**
```ts
const rawBody = await request.text();          // exactly once
verifySignature(rawBody, headers);             // always against the raw string
const event = JSON.parse(rawBody);
```
Verifying against re-serialised JSON breaks the signature. Re-reading throws
"Body has already been used".

**4. The signature is the first gate, not the defence.**
After validating it, **re-query the charge on the gateway API** and check status
and amount before marking the order paid.

**5. Idempotency is mandatory.**
Record `(provider, event_id)` in `webhook_events` (UNIQUE index) **before**
crediting. Mercado Pago resends webhooks; without it the same order is paid twice
and the owner delivers the item twice.

**6. Answer 200 fast**; the rest goes in `ctx.waitUntil()`.

**7. Check the amount.** If the paid amount differs from the order total, or the
gateway does not report one, do not mark it paid: move it to `needs_review` with
a note. An unknown amount is not the same as a checked amount.

**8. Never expire an order without asking the gateway.** Expiring blindly turns a
gateway outage into a customer who paid and got nothing. Only an order that never
got a charge is safe to expire without asking.

**9. A late payment cannot vanish.** A Pix confirmed after the order expired goes
to `needs_review`, because the money really did arrive.

**10. Tell "repeated event" apart from "the database failed".** Only a UNIQUE
violation is a duplicate; any other error returns 500 so the gateway resends. Use
`isUniqueViolation()` from `lib/sqlite-errors.ts` — the text lives in the
`cause` of the `DrizzleQueryError`, not in its `message`.

## Mercado Pago signature

Header `x-signature: ts=<epoch>,v1=<hex>`. Manifest:

```
id:<lowercase data.id>;request-id:<x-request-id>;ts:<ts>;
```

Missing parts are omitted along with their `;`. HMAC-SHA256 with the **webhook
secret from the dashboard** — which is not the access token — compared in
constant time, and rejected when the `ts` is more than five minutes old.

## State machine

```
awaiting_payment ──(webhook paid)──> paid ──(admin delivers)──> delivered
       │      │                       │                             │
       │      └──(wrong or unknown    └──(admin)──> refunded <───────┘
       │          amount)──┐
       │(cron: gateway     │
       │  says unpaid)     ▼
       └────> expired ──> needs_review ──(admin)──> paid | cancelled
                     (Pix landed after expiry)
```

`TRANSITIONS` in `lib/orders.ts` is the source of truth. A `delivered` order
never goes back to `paid`; `needs_review` never jumps straight to `delivered` —
review exists so a human checks first.

**Every status change uses the status guard in the `WHERE` and checks how many
rows it affected.** Without that, two admins clicking "Entreguei" at the same
time both get success and the item ships twice.

## The provider interface

`src/worker/payments/provider.ts` defines:

- `createPixCharge(input)` → `{ chargeId, brCode, qrBase64, expiresAt }`
- `getCharge(chargeId)` → normalised status
- `verifyWebhookSignature(rawBody, headers)` → `boolean`
- `parseEvent(rawBody, headers)` → `{ eventId, chargeId, type }`

Implementations: `mercadopago.ts` (production) and `mock.ts` (development and
tests).

## Testing without a usable sandbox

Mercado Pago **cannot really pay a Pix in sandbox**. Hence `MockProvider`: it
stores charge state in KV and `simulatePayment(chargeId, paidCents?)` marks it
paid, with an optional amount override that reproduces an underpayment.

Tests build a signed webhook from the mock and post it to the real
`/api/webhook/pix`, so signature, idempotency and crediting are all exercised.
The final production check is a real R$ 0,01 purchase.

## The safety net

Cron every 5 minutes (`scheduled` in `src/worker/index.ts`): re-queries orders
awaiting payment and expires **only** those the gateway confirms as unpaid.

Three details that look like trivia and are not:

- **Ordered by expiry**, not by creation: whoever is closest to expiring needs a
  decision now, and resolving them frees the slot.
- **Few orders per run** (20). Workers caps subrequests per invocation; asking
  for more makes the whole batch fail midway, run after run.
- **The provider comes from the order**, not from current configuration.
  Switching `mock` to `mercadopago` on deploy leaves older charges existing only
  at the previous provider.

There is also an abuse brake independent of Turnstile: one IP may only hold a few
open orders at a time. Without it a script would flood the pending queue and
drown this very reconciliation.
