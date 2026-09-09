import { Hono } from "hono";
import type { AppEnv } from "./env";
import { errorResponse } from "./lib/errors";
import { reconcileOrders } from "./lib/orders";
import { catalog } from "./routes/catalog";
import { checkout } from "./routes/checkout";
import { publicOrders } from "./routes/orders";
import { webhook } from "./routes/webhook";
import { dev } from "./routes/dev";
import { adminSession } from "./routes/admin/session";
import { adminCatalog } from "./routes/admin/catalog";
import { adminOrders } from "./routes/admin/orders";
import { adminUpload } from "./routes/admin/upload";
import type { ApiError } from "@shared/types";

const app = new Hono<AppEnv>();

app.onError((e, c) => errorResponse(c, e));

// Public
app.route("/api", catalog);
app.route("/api", checkout);
app.route("/api", publicOrders);
app.route("/api", webhook);
app.route("/api", dev);

// Admin panel. Each router applies `requireAdmin` to its own routes, except the
// session one, where login has to be reachable without a session.
app.route("/api", adminSession);
app.route("/api", adminOrders);
app.route("/api", adminCatalog);
app.route("/api", adminUpload);

app.get("/api/health", (c) =>
  c.json({ ok: true, environment: c.env.ENVIRONMENT, now: new Date().toISOString() }),
);

// Any unmapped /api/* is an API error — it must never fall through to the SPA
// index.html, or the front-end receives HTML where it expects JSON.
app.all("/api/*", (c) => c.json({ error: "Rota não encontrada." } satisfies ApiError, 404));

export default {
  fetch: app.fetch,

  /**
   * Cron every 5 minutes: the payment safety net.
   * Re-queries orders awaiting payment on the gateway (in case the webhook was
   * lost) and expires the ones it confirms as unpaid.
   */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(reconcileOrders(env).catch((e) => console.error("Reconciliation failed:", e)));
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
