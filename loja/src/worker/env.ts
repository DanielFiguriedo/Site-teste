/**
 * Worker bindings and variables.
 *
 * Secrets NEVER live in wrangler.jsonc — they are set with
 * `wrangler secret put <NAME>` in production and in `.dev.vars` locally.
 */
export interface Env {
  // Bindings
  DB: D1Database;
  BUCKET: R2Bucket;
  SESSIONS: KVNamespace;

  // Public variables (wrangler.jsonc)
  ENVIRONMENT: "development" | "production";
  PAYMENT_PROVIDER: "mock" | "mercadopago";
  /** Turnstile public key. Empty disables the widget. */
  TURNSTILE_SITE_KEY?: string;

  // Secrets
  SESSION_SECRET: string;
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}

/** Typed Hono context shared by every route. */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** Set by the auth middleware on /api/admin/* routes. */
    adminId?: number;
    adminEmail?: string;
  };
};
