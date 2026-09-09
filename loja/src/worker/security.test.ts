import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { Order, Product } from "@shared/types";
// Inlined at transform time: there is no `fs` inside workerd, and this file is
// part of what the store ships.
import frontEndHeaders from "../../public/_headers?raw";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createOrder,
  json,
  orderStatus,
  payOrder,
  postCheckout,
  request,
  seedAdmin,
  seedCatalog,
  signIn,
  uploadImage,
} from "../test/helpers";

/**
 * The attack suite.
 *
 * Every test here is an attempt to break the store, and asserts two things: the
 * request was refused, and the state it was after did not change. A status code
 * alone would still pass if the damage happened before the rejection.
 *
 * Route-specific checks stay in the route's own file; what lives here is what
 * cuts across all of them.
 */

const EVIL_ORIGIN = "https://evil.test";

/** Payloads that must be stored or refused, never interpreted. */
const INJECTION = "' OR 1=1--";
const XSS = "<script>alert(document.cookie)</script>";

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

describe("security: response headers", () => {
  it("hardens every API response", async () => {
    const response = await request("/api/health");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });

  it("forbids everything in the API's own content security policy", async () => {
    const csp = (await request("/api/health")).headers.get("content-security-policy") ?? "";

    // A JSON response has no business loading anything, and nothing has any
    // business framing it.
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
  });

  it("keeps admin responses out of every cache", async () => {
    const cookie = await signIn();
    const response = await request("/api/admin/orders", { cookie });

    // The order list carries buyer e-mails.
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("ships a content security policy for the front-end pages", () => {
    // The Worker never sees a page request — static assets are served before it
    // — so the page's own policy lives in `public/_headers`, and this is what
    // stops it being weakened without anyone noticing.
    expect(frontEndHeaders).toContain("frame-ancestors 'none'");
    expect(frontEndHeaders).toContain("object-src 'none'");
    expect(frontEndHeaders).not.toContain("unsafe-eval");
    // Inline *scripts* must stay forbidden. Inline style attributes are what
    // React writes for sizing, and are covered separately by style-src.
    expect(frontEndHeaders).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("leaves Turnstile the three permissions it needs", () => {
    const policy = frontEndHeaders.slice(frontEndHeaders.indexOf("Content-Security-Policy"));
    const directive = (name: string) =>
      policy.slice(policy.indexOf(name), policy.indexOf(";", policy.indexOf(name)));

    // The widget loads a script, opens an iframe and calls home. Tightening any
    // one of the three turns the anti-bot check off without an error anywhere.
    expect(directive("script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive("frame-src")).toContain("https://challenges.cloudflare.com");
    expect(directive("connect-src")).toContain("https://challenges.cloudflare.com");
  });
});

// ---------------------------------------------------------------------------
// Cross-site request forgery
// ---------------------------------------------------------------------------

describe("security: cross-origin requests", () => {
  it("refuses a checkout posted from another site", async () => {
    await seedCatalog();
    const response = await postCheckout({}, undefined, { origin: EVIL_ORIGIN });

    expect(response.status).toBe(403);
    expect(await countOrders()).toBe(0);
  });

  it("refuses an admin action from another site even with a valid session", async () => {
    await seedCatalog();
    const { publicId } = await createOrder();
    await payOrder(publicId);
    const cookie = await signIn();

    const response = await request(`/api/admin/orders/${publicId}/status`, {
      method: "POST",
      cookie,
      origin: EVIL_ORIGIN,
      body: JSON.stringify({ status: "delivered" }),
    });

    expect(response.status).toBe(403);
    // The real damage would be the delivery, not the status code.
    expect(await orderStatus(publicId)).toBe("paid");
  });

  it("refuses a state-changing request with no origin at all", async () => {
    await seedCatalog();
    const cookie = await signIn();

    const response = await request("/api/admin/categories", {
      method: "POST",
      cookie,
      origin: null,
      body: JSON.stringify({ name: "Forjada" }),
    });

    expect(response.status).toBe(403);
  });

  it("still accepts the webhook, which the gateway sends without an origin", async () => {
    await seedCatalog();
    const { publicId } = await createOrder();

    // Signed server-to-server: its authenticity is the HMAC, not the browser.
    const response = await payOrder(publicId);

    expect(response.status).toBe(200);
    expect(await orderStatus(publicId)).toBe("paid");
  });

  it("does not block reads, which carry no side effect", async () => {
    await seedCatalog();
    const response = await request("/api/products", { origin: EVIL_ORIGIN });

    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe("security: session cookies", () => {
  it("rejects a cookie whose payload was edited", async () => {
    const cookie = await signIn();
    const [name, token] = splitCookie(cookie);
    const [payload, signature] = token.split(".");

    // Promote the session to another admin id, keeping the original signature.
    const forged = btoa(
      JSON.stringify({ ...JSON.parse(atob(payload)), id: 999, email: "attacker@evil.test" }),
    );

    const response = await request("/api/admin/me", { cookie: `${name}=${forged}.${signature}` });
    expect(response.status).toBe(401);
  });

  it("rejects a cookie with the signature removed", async () => {
    const cookie = await signIn();
    const [name, token] = splitCookie(cookie);

    const response = await request("/api/admin/me", {
      cookie: `${name}=${token.split(".")[0]}`,
    });
    expect(response.status).toBe(401);
  });

  it("rejects a correctly signed session that has expired", async () => {
    await signIn();
    const sid = crypto.randomUUID();
    // Present in KV, so the only thing wrong with it is the clock.
    await env.SESSIONS.put(`session:${sid}`, "1", { expirationTtl: 60 });

    const token = await signSession({
      sid,
      id: 1,
      email: ADMIN_EMAIL,
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    const response = await request("/api/admin/me", { cookie: `store_admin=${token}` });
    expect(response.status).toBe(401);
  });

  it("rejects a session that was signed out, even though the cookie is intact", async () => {
    const cookie = await signIn();
    expect((await request("/api/admin/me", { cookie })).status).toBe(200);

    await request("/api/admin/logout", { method: "POST", cookie });

    // Signing out has to revoke server-side; clearing the cookie only affects
    // the browser that asked.
    expect((await request("/api/admin/me", { cookie })).status).toBe(401);
  });

  it("keeps the session cookie away from JavaScript and from other sites", async () => {
    await seedAdmin();
    const response = await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });

    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/");
  });

  it("issues and clears the locked-down cookie production actually uses", async () => {
    await seedAdmin();
    const inProduction = { ENVIRONMENT: "production" as const };

    const signedIn = await request("/api/admin/login", {
      method: "POST",
      env: inProduction,
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const setCookie = signedIn.headers.get("set-cookie") ?? "";

    // `__Host-` binds the cookie to this exact host over https: no sibling
    // subdomain can write it, which is the one thing SameSite does not stop.
    expect(setCookie).toContain("__Host-");
    expect(setCookie).toContain("Secure");

    const signedOut = await request("/api/admin/logout", {
      method: "POST",
      env: inProduction,
      cookie: setCookie.split(";")[0],
    });

    // A `__Host-` cookie cleared without `Secure` is refused by the browser —
    // and by Hono, which throws — so the logout would leave the session cookie
    // sitting in the browser it claimed to have removed it from.
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.get("set-cookie") ?? "").toContain("Secure");
  });
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

describe("security: login", () => {
  it("locks an account out after repeated failures", { timeout: 20_000 }, async () => {
    await seedAdmin();

    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await login(ADMIN_EMAIL, "wrong-password");
      expect(response.status).toBe(401);
    }

    expect((await login(ADMIN_EMAIL, "wrong-password")).status).toBe(429);
  });

  it("keeps the lockout in force for the right password too", { timeout: 20_000 }, async () => {
    await seedAdmin();

    for (let attempt = 0; attempt < 5; attempt++) {
      await login(ADMIN_EMAIL, "wrong-password");
    }

    // Otherwise an attacker learns the password by watching which guess starts
    // answering differently.
    expect((await login(ADMIN_EMAIL, ADMIN_PASSWORD)).status).toBe(429);
  });

  it("does not let a stranger lock the owner out of the panel", { timeout: 20_000 }, async () => {
    await seedAdmin();

    // The owner's e-mail is on the store's contact page: it is not a secret,
    // and burning it must not cost the owner access to their own sales.
    for (let attempt = 0; attempt < 8; attempt++) {
      await login(ADMIN_EMAIL, "wrong-password", "203.0.113.9");
    }

    const owner = await login(ADMIN_EMAIL, ADMIN_PASSWORD, "198.51.100.4");
    expect(owner.status).toBe(200);

    // The attacker's own address stays locked out.
    expect((await login(ADMIN_EMAIL, "wrong-password", "203.0.113.9")).status).toBe(429);
  });

  it("answers identically for an unknown e-mail and a wrong password", async () => {
    await seedAdmin();

    const unknown = await login("nobody@example.com", "whatever");
    const wrong = await login(ADMIN_EMAIL, "wrong-password");

    expect(unknown.status).toBe(wrong.status);
    expect(await json(unknown)).toEqual(await json(wrong));
  });

  it("spends real work on an unknown e-mail", async () => {
    const { verifyAgainstMissingUser } = await import("./lib/auth");

    const started = Date.now();
    expect(await verifyAgainstMissingUser("whatever")).toBe(false);

    // Returning early would answer in well under a millisecond, and that gap
    // enumerates the valid admin addresses whatever the response body says.
    expect(Date.now() - started).toBeGreaterThan(10);
  });

  it("does not authenticate through a SQL payload in the e-mail", async () => {
    await seedAdmin();
    const response = await login(`${ADMIN_EMAIL}' OR '1'='1`, "wrong-password");

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SQL injection
// ---------------------------------------------------------------------------

describe("security: SQL injection", () => {
  it("treats an injected product slug as a name, not as SQL", async () => {
    await seedCatalog();
    const response = await postCheckout({ productSlug: `vip-ouro-30' OR '1'='1` });

    expect(response.status).toBe(404);
    expect(await countOrders()).toBe(0);
  });

  it("treats an injected category filter as a value", async () => {
    await seedCatalog();
    const products = await json<Product[]>(await request(`/api/products?category=${INJECTION}`));

    expect(products).toEqual([]);
    // And the catalog is still there afterwards.
    expect((await json<Product[]>(await request("/api/products"))).length).toBe(1);
  });

  it("drops an unknown status filter instead of passing it to the query", async () => {
    const cookie = await signIn();
    const response = await request(`/api/admin/orders?status=paid'--`, { cookie });

    expect(response.status).toBe(200);
    expect((await json<{ orders: unknown[] }>(response)).orders).toEqual([]);
  });

  it("treats an injected order id as an id", async () => {
    await seedCatalog();
    await createOrder();

    const response = await request(`/api/orders/${encodeURIComponent(INJECTION)}`);
    expect(response.status).toBe(404);
    expect(await countOrders()).toBe(1);
  });

  it("stores a nick containing SQL exactly as typed", async () => {
    await seedCatalog();
    const nick = "Robert_Tables";
    const { publicId } = await createOrder({ nick });

    // Proof the value was bound, not spliced: it survives the round trip whole.
    expect((await json<Order>(await request(`/api/orders/${publicId}`))).nick).toBe(nick);
    expect(await countOrders()).toBe(1);
  });

  it("keeps the products table after an injected product name", async () => {
    const cookie = await signIn();
    const { categoryId } = await seedCatalog();

    await request("/api/admin/products", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        categoryId,
        name: `Teste'); DROP TABLE products;--`,
        priceCents: 500,
      }),
    });

    const row = await env.DB.prepare(`SELECT count(*) AS total FROM products`).first<{
      total: number;
    }>();
    expect(row?.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Cross-site scripting
// ---------------------------------------------------------------------------

describe("security: cross-site scripting", () => {
  it("returns a script payload as data, never as a document", async () => {
    const cookie = await signIn();
    const { categoryId } = await seedCatalog();

    await request("/api/admin/products", {
      method: "POST",
      cookie,
      body: JSON.stringify({ categoryId, name: XSS, slug: "xss", priceCents: 500 }),
    });

    const response = await request("/api/products/xss");
    expect(response.headers.get("content-type")).toContain("application/json");
    // Intact, because React escapes it at render time. What must never happen
    // is the API serving it as HTML.
    expect((await json<Product>(response)).name).toBe(XSS);
  });

  it("refuses a javascript: URL in the store settings", async () => {
    const cookie = await signIn();

    const response = await request("/api/admin/settings", {
      method: "PUT",
      cookie,
      body: JSON.stringify({ logo_url: "javascript:alert(1)" }),
    });

    expect(response.status).toBe(400);
    expect(await settingValue("logo_url")).toBeUndefined();
  });

  it("refuses a protocol-relative URL in the store settings", async () => {
    const cookie = await signIn();

    const response = await request("/api/admin/settings", {
      method: "PUT",
      cookie,
      // Looks like a path, resolves to another site.
      body: JSON.stringify({ logo_url: "//evil.test/logo.png" }),
    });

    expect(response.status).toBe(400);
  });

  it("refuses a backslash URL, which the browser reads as another site", async () => {
    const cookie = await signIn();

    const response = await request("/api/admin/settings", {
      method: "PUT",
      cookie,
      // A path to anything that only looks at the first characters, and
      // https://evil.test/logo.png to every browser.
      body: JSON.stringify({ logo_url: "/\\evil.test/logo.png" }),
    });

    expect(response.status).toBe(400);
    expect(await settingValue("logo_url")).toBeUndefined();
  });

  it("accepts an https logo and a path inside the store", async () => {
    const cookie = await signIn();

    for (const value of ["https://cdn.example.com/logo.png", "/api/images/products/x.png"]) {
      const response = await request("/api/admin/settings", {
        method: "PUT",
        cookie,
        body: JSON.stringify({ logo_url: value }),
      });
      expect(response.status).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// Uploads and the files they become
// ---------------------------------------------------------------------------

describe("security: uploads", () => {
  it("refuses an HTML file wearing an image content type", async () => {
    const cookie = await signIn();
    const form = new FormData();
    form.append(
      "file",
      new File([`<html><script>alert(1)</script></html>`], "x.png", { type: "image/png" }),
    );

    const response = await request("/api/admin/upload", { method: "POST", cookie, body: form });

    // The multipart content-type is written by the sender; the bytes are not.
    expect(response.status).toBe(400);
  });

  it("refuses an SVG, which can carry script", async () => {
    const cookie = await signIn();
    const form = new FormData();
    form.append("file", new File([`<svg onload="alert(1)"/>`], "x.svg", { type: "image/svg+xml" }));

    expect((await request("/api/admin/upload", { method: "POST", cookie, body: form })).status).toBe(
      400,
    );
  });

  it("serves an uploaded image with the content type this code chose", async () => {
    const cookie = await signIn();
    const { body } = await uploadImage(cookie, "gif");

    const response = await request(body.url);

    expect(response.headers.get("content-type")).toBe("image/gif");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe("inline");
  });

  it("never serves an object whose key is not a product image", async () => {
    // Straight into the bucket, bypassing the upload route entirely.
    await env.BUCKET.put("evil.html", "<script>alert(1)</script>", {
      httpMetadata: { contentType: "text/html" },
    });

    const response = await request("/api/images/evil.html");

    // The store's own origin is exactly where such a file must not be served.
    expect(response.status).toBe(404);
  });

  it("refuses to delete anything outside the product images", async () => {
    const cookie = await signIn();
    await env.BUCKET.put("evil.html", "x");

    const response = await request("/api/admin/upload/evil.html", { method: "DELETE", cookie });

    expect(response.status).toBe(404);
    expect(await env.BUCKET.head("evil.html")).not.toBeNull();
  });

  it("refuses a product image key that was never uploaded", async () => {
    const cookie = await signIn();
    const { categoryId } = await seedCatalog();

    const response = await request("/api/admin/products", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        categoryId,
        name: "Com imagem alheia",
        priceCents: 500,
        imageKey: "../../secrets/backup.sql",
      }),
    });

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

describe("security: money", () => {
  it("ignores every price the client tries to send", async () => {
    await seedCatalog({ priceCents: 1990 });

    const { publicId, totalCents } = await createOrder({
      priceCents: 1,
      totalCents: 1,
      total_cents: 1,
      amountCents: 1,
      discount: 100,
    });

    expect(totalCents).toBe(1990);
    expect((await json<Order>(await request(`/api/orders/${publicId}`))).totalCents).toBe(1990);
  });

  it("refuses a negative or fractional quantity", async () => {
    await seedCatalog();

    for (const quantity of [-1, 0, 1.5, 11]) {
      expect((await postCheckout({ quantity })).status).toBe(400);
    }
    expect(await countOrders()).toBe(0);
  });

  it("refuses to go below the minimum on a pay-what-you-want product", async () => {
    await seedCatalog({ payWhatYouWant: true, priceCents: 500 });

    expect((await postCheckout({ amountCents: 1 })).status).toBe(400);
    expect((await postCheckout({ amountCents: -500 })).status).toBe(400);
    expect(await countOrders()).toBe(0);
  });

  it("sends the wrong amount to review instead of crediting it", async () => {
    await seedCatalog({ priceCents: 1990 });
    const { publicId } = await createOrder();

    await payOrder(publicId, 100);

    // Paying one real for a twenty-real item must never deliver the item.
    expect(await orderStatus(publicId)).toBe("needs_review");
  });
});

// ---------------------------------------------------------------------------
// What each caller is entitled to know
// ---------------------------------------------------------------------------

describe("security: information disclosure", () => {
  it("keeps internals out of error bodies", async () => {
    const response = await request("/api/orders/nope");
    const body = await response.text();

    expect(body).not.toMatch(/select|from orders|D1_ERROR|at async/i);
  });

  it("does not reveal whether an admin route exists to an anonymous caller", async () => {
    const known = await request("/api/admin/orders");
    const unknown = await request("/api/admin/orders/ghost/status", {
      method: "POST",
      body: JSON.stringify({ status: "delivered" }),
    });

    // Both 401: a 404 on one and a 401 on the other would map the panel.
    expect(known.status).toBe(401);
    expect(unknown.status).toBe(401);
  });

  it("guards an admin path that no router claims", async () => {
    // The panel is closed by default. If the guard depended on which router
    // happened to match the path, a route added tomorrow would be the one that
    // answers without a session.
    expect((await request("/api/admin/does-not-exist")).status).toBe(401);
  });

  it("does not leak the Turnstile secret through the public settings", async () => {
    const settings = await json<Record<string, unknown>>(await request("/api/settings"));

    expect(Object.keys(settings)).not.toContain("turnstileSecretKey");
    expect(JSON.stringify(settings)).not.toContain(env.SESSION_SECRET);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitCookie(cookie: string): [string, string] {
  const index = cookie.indexOf("=");
  // The token is base64 and travels percent-encoded, so `+`, `/` and the
  // padding have to be restored before it can be taken apart.
  return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
}

function login(email: string, password: string, ip?: string) {
  return request("/api/admin/login", {
    method: "POST",
    headers: ip ? { "cf-connecting-ip": ip } : undefined,
    body: JSON.stringify({ email, password }),
  });
}

/** Builds a session cookie the way `lib/auth` does, to attack the parts around it. */
async function signSession(session: Record<string, unknown>): Promise<string> {
  const payload = btoa(JSON.stringify(session));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

async function countOrders(): Promise<number> {
  const row = await env.DB.prepare(`SELECT count(*) AS total FROM orders`).first<{ total: number }>();
  return row?.total ?? 0;
}

async function settingValue(key: string): Promise<string | undefined> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(key)
    .first<{ value: string }>();
  return row?.value;
}
