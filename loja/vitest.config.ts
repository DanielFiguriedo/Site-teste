import { defineConfig } from "vitest/config";
import {
  cloudflarePool,
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import path from "node:path";

// Read at config time, in Node, and handed to the tests as a binding: the
// Workers runtime has no file system to read them from.
const migrations = await readD1Migrations("./migrations");

const workersOptions = {
  wrangler: { configPath: "./wrangler.jsonc" },
  miniflare: {
    // The `workerd` bundled with the test pool lags behind the one Wrangler
    // deploys with, so it refuses the production compatibility date. Pinning it
    // here keeps production on the newer date; raise this whenever the pool
    // ships a newer runtime.
    compatibilityDate: "2026-08-22",
    // Overrides the production values from wrangler.jsonc: tests must never
    // talk to a real gateway.
    bindings: {
      ENVIRONMENT: "development",
      PAYMENT_PROVIDER: "mock",
      SESSION_SECRET: "test-session-secret",
      TURNSTILE_SITE_KEY: "",
      TEST_MIGRATIONS: migrations,
    },
  },
};

/**
 * Tests run inside the real Workers runtime (`workerd`), against real D1 and KV.
 *
 * That is the whole point: unit tests over pure logic cannot catch a broken SQL
 * query, a missing migration or an auth middleware that stopped guarding a
 * route — which is exactly what breaks when a feature is added.
 *
 * The plugin resolves the `cloudflare:test` module; the pool runs each test file
 * inside the runtime.
 */
export default defineConfig({
  plugins: [cloudflareTest(workersOptions)],
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    pool: cloudflarePool(workersOptions),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "./src/shared"),
    },
  },
});
