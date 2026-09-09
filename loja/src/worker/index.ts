import { Hono } from "hono";
import type { AppEnv } from "./env";
import { errorResponse } from "./lib/errors";
import { requireAdmin } from "./lib/auth";
import { apiSecurityHeaders, noStore, requireSameOrigin } from "./lib/security";
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

// Security headers, the origin check and the no-cache rule for admin data are
// registered before every route, so a route added later cannot forget them.
app.use("/api/*", apiSecurityHeaders);
app.use("/api/*", requireSameOrigin);
app.use("/api/admin/*", noStore);

/**
 * The panel's guard, registered once for the whole panel.
 *
 * Per-router guards would work only as long as every admin router remembered to
 * add one, and only in the order they happen to be mounted. Here the exception
 * is explicit: login and logout are the two endpoints that must answer without
 * a session, and everything else under `/api/admin/` is closed by default —
 * including a path no router claims, which answers 401 rather than mapping the
 * panel for whoever is probing it.
 */
const PUBLIC_ADMIN_PATHS = new Set(["/api/admin/login", "/api/admin/logout"]);

app.use("/api/admin/*", (c, next) =>
  PUBLIC_ADMIN_PATHS.has(c.req.path) ? next() : requireAdmin(c, next),
);

// Public
app.route("/api", catalog);
app.route("/api", checkout);
app.route("/api", publicOrders);
app.route("/api", webhook);
app.route("/api", dev);

// Admin panel. The guard above covers every route in these routers.
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
