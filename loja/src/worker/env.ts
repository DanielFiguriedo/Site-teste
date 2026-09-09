/**
 * Bindings e variáveis do Worker.
 *
 * Segredos NUNCA entram no wrangler.jsonc — são definidos com
 * `wrangler secret put <NOME>` em produção e em `.dev.vars` localmente.
 */
export interface Env {
  // Bindings
  DB: D1Database;
  BUCKET: R2Bucket;
  SESSIONS: KVNamespace;
  ASSETS: Fetcher;

  // Variáveis públicas (wrangler.jsonc)
  AMBIENTE: "desenvolvimento" | "producao";
  PAGAMENTO_PROVIDER: "mock" | "mercadopago";

  // Segredos
  SESSION_SECRET: string;
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}

/** Contexto tipado do Hono usado por todas as rotas. */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** Preenchido pelo middleware de autenticação nas rotas /api/admin/*. */
    adminId?: number;
    adminEmail?: string;
  };
};
