import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../worker/index";
import type { Env } from "../worker/env";
import { hashPassword } from "../worker/lib/auth";
import { MockProvider } from "../worker/payments/mock";

export const BASE = "https://store.test";

/**
 * `wrangler types` widens every var to `string`, while the Worker narrows
 * `ENVIRONMENT` and `PAYMENT_PROVIDER` to unions. This is the single place that
 * reconciles the two, instead of loosening the Worker's own contract.
 */
const workerEnv = env as unknown as Env;

/**
 * Calls the Worker the way the network does, then waits for `waitUntil` work.
 *
 * Waiting matters: the webhook returns 200 immediately and credits the order in
 * the background. A test that skipped this would assert on the state before the
 * credit landed and pass or fail at random.
 */
export async function request(
  path: string,
  init: RequestInit & { cookie?: string; origin?: string | null; env?: Partial<Env> } = {},
): Promise<Response> {
  const { cookie, origin, env: envOverrides, ...rest } = init;
  const headers = new Headers(rest.headers);
  // Only for JSON bodies: forcing a content-type onto FormData would strip
  // the multipart boundary the runtime generates.
  if (typeof rest.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (cookie) headers.set("cookie", cookie);

  // Browsers attach `Origin` to every state-changing request, so the default
  // here is the store's own. `origin: "https://evil.test"` forges one and
  // `origin: null` sends none, which is how the CSRF tests are written.
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes((rest.method ?? "GET").toUpperCase());
  if (origin) headers.set("origin", origin);
  else if (origin === undefined && unsafeMethod) headers.set("origin", BASE);

  // `env: { ENVIRONMENT: "production" }` exercises the behaviour that only
  // exists in production — the `__Host-` cookie prefix, above all — which the
  // test runner would otherwise never reach.
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`${BASE}${path}`, { ...rest, headers }),
    envOverrides ? { ...workerEnv, ...envOverrides } : workerEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

/** Runs the cron handler and waits for its background work. */
export async function runScheduled(): Promise<void> {
  const ctx = createExecutionContext();
  await worker.scheduled(
    { cron: "*/5 * * * *", scheduledTime: Date.now(), noRetry: () => {} },
    workerEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
}

export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** A category plus a product, which is the minimum most tests need. */
export async function seedCatalog(
  overrides: Partial<{
    slug: string;
    name: string;
    priceCents: number;
    stock: number | null;
    active: boolean;
    giftable: boolean;
    payWhatYouWant: boolean;
    featured: boolean;
    categorySlug: string;
    categoryName: string;
  }> = {},
) {
  const {
    slug = "vip-ouro-30",
    name = "VIP OURO [30 DIAS]",
    priceCents = 1990,
    stock = null,
    active = true,
    giftable = true,
    payWhatYouWant = false,
    featured = false,
    categorySlug = "vip",
    categoryName = "VIP",
  } = overrides;

  await env.DB.prepare(
    `INSERT INTO categories (slug, name, position, active)
     VALUES (?, ?, 1, 1)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name`,
  )
    .bind(categorySlug, categoryName)
    .run();

  const category = await env.DB.prepare(`SELECT id FROM categories WHERE slug = ?`)
    .bind(categorySlug)
    .first<{ id: number }>();

  await env.DB.prepare(
    `INSERT INTO products
       (category_id, slug, name, price_cents, stock, active, giftable, pay_what_you_want, featured, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(
      category!.id,
      slug,
      name,
      priceCents,
      stock,
      active ? 1 : 0,
      giftable ? 1 : 0,
      payWhatYouWant ? 1 : 0,
      featured ? 1 : 0,
    )
    .run();

  return { categoryId: category!.id, slug, priceCents };
}

export interface CheckoutOverrides {
  productSlug?: string;
  quantity?: number;
  amountCents?: number;
  nick?: string;
  email?: string;
  recipientNick?: string;
  [extra: string]: unknown;
}

/** Posts a checkout with sensible defaults, returning the raw response. */
export async function postCheckout(
  overrides: CheckoutOverrides = {},
  ip?: string,
  init: { origin?: string | null } = {},
) {
  return request("/api/checkout", {
    method: "POST",
    ...init,
    headers: ip ? { "cf-connecting-ip": ip } : undefined,
    body: JSON.stringify({
      productSlug: "vip-ouro-30",
      quantity: 1,
      nick: "Steve_BR",
      email: "buyer@example.com",
      ...overrides,
    }),
  });
}

/** Creates an order and returns its public id. */
export async function createOrder(overrides: CheckoutOverrides = {}, ip?: string) {
  const response = await postCheckout(overrides, ip);
  if (response.status !== 201) {
    throw new Error(`Checkout failed with ${response.status}: ${await response.text()}`);
  }
  return json<{ publicId: string; totalCents: number }>(response);
}

/**
 * Pays an order the way the gateway would.
 *
 * Marks the simulated charge as paid and posts a properly signed webhook to the
 * real `/api/webhook/pix` endpoint, so the test still goes through signature
 * verification, idempotency and the credit path.
 *
 * The browser uses `/api/dev/simulate-payment` for the same thing, but that
 * route reaches the endpoint over the network — a subrequest that does not loop
 * back to the Worker under test.
 *
 * `paidCents` overrides the amount, which is how an underpaid charge is
 * reproduced.
 */
export async function payOrder(publicId: string, paidCents?: number) {
  const chargeId = await chargeIdOf(publicId);
  const mock = new MockProvider(env.SESSIONS, env.SESSION_SECRET);

  if (!(await mock.simulatePayment(chargeId, paidCents))) {
    throw new Error(`No simulated charge found for order ${publicId}.`);
  }

  const { body, signature } = await mock.buildWebhook(chargeId);
  return request("/api/webhook/pix", {
    method: "POST",
    headers: { "x-mock-signature": signature },
    body,
  });
}

export async function chargeIdOf(publicId: string): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT provider_charge_id AS id FROM orders WHERE public_id = ?`,
  )
    .bind(publicId)
    .first<{ id: string }>();
  if (!row?.id) throw new Error(`Order ${publicId} has no charge id.`);
  return row.id;
}

export async function orderStatus(publicId: string): Promise<string> {
  const row = await env.DB.prepare(`SELECT status FROM orders WHERE public_id = ?`)
    .bind(publicId)
    .first<{ status: string }>();
  return row?.status ?? "missing";
}

export const ADMIN_EMAIL = "owner@example.com";
export const ADMIN_PASSWORD = "a-very-strong-password";

export async function seedAdmin(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const hash = await hashPassword(password);
  await env.DB.prepare(
    `INSERT INTO admin_users (email, password_hash) VALUES (?, ?)
     ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash`,
  )
    .bind(email, hash)
    .run();
}

/** Signs in and returns the cookie header to reuse on protected requests. */
export async function signIn(email = ADMIN_EMAIL, password = ADMIN_PASSWORD): Promise<string> {
  await seedAdmin(email, password);
  const response = await request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 200) {
    throw new Error(`Login failed with ${response.status}: ${await response.text()}`);
  }
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login did not return a session cookie.");
  return setCookie.split(";")[0];
}

/**
 * Real first bytes for each accepted image format.
 *
 * The upload identifies the format from the file itself, not from the
 * multipart content-type, so a test that sends four arbitrary bytes labelled
 * "image/png" is correctly rejected — and would be testing nothing.
 */
const MAGIC: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff, 0xe0],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  // RIFF container: "RIFF" <4 length bytes> "WEBP".
  webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
};

export function imageBytes(format: keyof typeof MAGIC = "png"): Uint8Array {
  // Padded so the file is not just its own header.
  return new Uint8Array([...MAGIC[format], ...new Array(32).fill(0)]);
}

/** Uploads an image and returns the key the store filed it under. */
export async function uploadImage(cookie: string, format: keyof typeof MAGIC = "png") {
  const form = new FormData();
  form.append("file", new File([imageBytes(format)], `p.${format}`, { type: `image/${format}` }));

  const response = await request("/api/admin/upload", { method: "POST", cookie, body: form });
  return { response, body: await json<{ key: string; url: string }>(response.clone()) };
}
