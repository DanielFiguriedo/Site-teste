import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

/**
 * Applies the migrations once per test worker.
 *
 * The tests run against the same migration files that ship to production, so a
 * schema change that breaks a query fails here instead of on deploy day.
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

/**
 * Storage is isolated per test *file*, not per test, so without this every test
 * would inherit the rows the previous one created — and a suite that passes in
 * isolation would fail when run together.
 *
 * Order matters: children before parents, because of the foreign keys.
 */
const TABLES = [
  "order_items",
  "orders",
  "products",
  "categories",
  "webhook_events",
  "admin_users",
  "settings",
];

beforeEach(async () => {
  for (const table of TABLES) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  // KV holds admin sessions, the login attempt counters and the simulated
  // charges; a leftover key would let one test authenticate, "pay", or inherit
  // another test's lockout.
  const { keys } = await env.SESSIONS.list();
  await Promise.all(keys.map((key) => env.SESSIONS.delete(key.name)));

  // R2 holds the product images. A leftover object would let one test serve a
  // file another test uploaded.
  const { objects } = await env.BUCKET.list();
  await Promise.all(objects.map((object) => env.BUCKET.delete(object.key)));
});
