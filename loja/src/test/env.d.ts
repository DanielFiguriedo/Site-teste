import type { D1Migration } from "@cloudflare/vitest-pool-workers";

/**
 * Test-only bindings.
 *
 * `wrangler types` generates `Cloudflare.Env` from wrangler.jsonc and .dev.vars;
 * the migrations are injected by vitest.config.ts and only exist under test, so
 * they are declared here rather than in the Worker's own `Env`.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
