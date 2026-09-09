---
name: security
description: Threat model, hardening rules and attack-test conventions for the store. ALWAYS use before touching auth, admin routes, uploads, the webhook, HTTP headers, or anything that renders user- or admin-authored content.
---

# Store security

The asset worth stealing here is **money and the admin session**. Everything
below is ordered by what an attacker actually gains.

Remember the language policy: identifiers, comments and tests are English; the
strings a user reads are Portuguese.

## Threat model

| Actor | Can reach | Wants |
|---|---|---|
| Anonymous buyer | public catalog, checkout, order page, webhook endpoint | pay less, get free items, read other people's orders |
| Script / bot | same | flood Pix charges until the gateway account is suspended |
| Compromised admin session | the whole panel | change prices, mark orders delivered, plant stored XSS |
| The payment gateway (or someone impersonating it) | `/api/webhook/pix` | credit an order that was never paid |

The owner is not a developer. A vulnerability that requires them to notice
something wrong in a dashboard is not mitigated.

## Non-negotiable rules

**The price never comes from the client.** Checkout accepts a slug and a
quantity. Anything resembling `priceCents`, `total` or `discount` in a request
body is a bug, not a feature.

**Every state-changing request checks its `Origin`.** `SameSite=Strict` is not
enough on a custom domain: a sibling subdomain is the *same site*, so a
compromised `blog.servidor.com.br` could post to the panel. `requireSameOrigin`
runs on every non-GET route **except the webhook**, which the gateway calls with
no `Origin` at all.

**Admin responses are `cache-control: no-store`.** The order list carries buyer
e-mails.

**Anything from R2 is served with a content type this code chose**, never the
one stored on the object, plus `nosniff` and a sandbox CSP. An image route that
echoes a stored content type is an upload-to-XSS chain waiting for one bad
upload.

**Uploads are verified by magic bytes**, not by the multipart `content-type` the
browser sent — that field is attacker-controlled.

**Login does the same work whether or not the e-mail exists.** Skipping the
PBKDF2 when the user is unknown returns in 1 ms instead of ~100 ms, which
enumerates valid admin e-mails no matter what the response body says. See
`DUMMY_HASH` in `lib/auth.ts`.

**Login is rate limited in KV**, per e-mail *and IP together*, and per IP. A
fixed delay does not limit an attacker who opens 200 connections at once. Never
key a hard lockout on the e-mail alone: the owner's address is public, so six
wrong guesses would lock them out of their own panel, and an owner who cannot
reach the panel cannot deliver what people paid for. Failures against one
e-mail from many addresses only add delay — never a refusal.

**The panel is closed by default, in one place.** `index.ts` registers a single
`app.use("/api/admin/*")` guard whose only exceptions are login and logout,
named explicitly. Per-router guards depend on every future router remembering,
and on mount order; an unmapped admin path must answer 401, not 404.

**Money that lands on a closed order is never swallowed.** Cancelling or
expiring an order does not cancel the charge at the gateway, so `expired`,
`cancelled` and `refunded` all go to `needs_review` when a payment arrives — the
owner decides. "Already processed" is only for the gateway resending an event
that was actually handled.

**A stored URL is parsed, not prefix-matched.** `//evil.test` and `/\evil.test`
both read as local paths and both resolve to another origin.

**Never render admin-authored text as HTML.** `components/Markdown.tsx` produces
React elements on purpose. Introducing `dangerouslySetInnerHTML`, or a Markdown
library that emits HTML, turns the settings form into stored XSS on every page.

**Secrets never reach the client.** `/api/settings` is public: only the
Turnstile *site* key belongs there. Grep before adding a field.

## SQL injection

Every query goes through Drizzle with bound parameters, which is why the
codebase has no injection surface today. Two things would reintroduce one:

- `sql` template fragments interpolating a request value. `sql` is used only
  with column references and constants (`unixepoch() - 3600`); a variable inside
  it must be a bound parameter, never a string splice.
- Building a `d1.prepare()` string by concatenation. Do not.

A route filtering by a user-supplied status must **validate against
`ORDER_STATUSES` first** (see `admin/orders.ts`), so an unknown value is dropped
rather than passed through.

## XSS

React escapes text, so the exposure is limited to sinks that bypass it:

| Sink | Rule |
|---|---|
| `dangerouslySetInnerHTML` | forbidden, no exceptions |
| `href` / `src` from stored data | must be validated; a `javascript:` URL in an `href` executes |
| SVG upload | rejected — SVG carries script |
| `<img src>` from R2 | served with a forced content type and `nosniff` |

The CSP in `public/_headers` is the backstop: no inline script, no `eval`,
`frame-ancestors 'none'`, `object-src 'none'`. It is a second line of defence,
not permission to be careless.

## Money

- Integer cents everywhere. A float rounding difference against the gateway is
  both a bug and an audit problem.
- `markAsPaid` credits **only** an exact amount match on an order still awaiting
  payment. Anything else — wrong amount, unknown amount, paid after expiry —
  goes to `needs_review` for a human. Never credit on a partial match.
- The webhook verifies the signature against the **raw body**, records the event
  under a UNIQUE `(provider, event_id)` before crediting, and re-queries the
  charge on the gateway API. Removing any one of those three re-opens a free
  order.

## Writing an attack test

The attack suite is `src/worker/security.test.ts`, grouped by attack class in
`describe("security: ...")` blocks — one file, so the whole attack surface can
be read in one sitting. Checks that only make sense next to one route stay in
that route's own test file.

A test proves an attack **fails**, so it asserts the status code *and* the
state that did not change:

```ts
it("rejects a forged price", async () => {
  await seedCatalog({ priceCents: 1990 });
  const response = await postCheckout({ productSlug: "vip", priceCents: 1 });

  expect(response.status).toBe(201);
  // The point is not the status: it is that the total ignored the client.
  expect(await orderTotal(await json(response))).toBe(1990);
});
```

Cover, for every new route:

1. **unauthenticated** — is it in the `PROTECTED` list in `admin.test.ts`?
2. **cross-origin** — does a forged `Origin` get a 403?
3. **injection** — a payload with `' OR 1=1--`, `<script>`, `../../` and a null
   byte must be stored or rejected verbatim, never interpreted.
4. **enumeration** — do "not found" and "not allowed" look identical?
5. **the state that must not change** after the attack.
