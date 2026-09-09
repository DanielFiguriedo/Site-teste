import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { MockProvider } from "../payments/mock";
import { notFound, badRequest, ApiError } from "../lib/errors";
import type { AppEnv } from "../env";

export const dev = new Hono<AppEnv>();

/**
 * Simulates a Pix confirmation.
 *
 * It exists because Mercado Pago's sandbox cannot actually pay a Pix charge.
 * Instead of calling the internal logic directly, this route builds a signed
 * webhook and delivers it to the real endpoint — so what gets exercised is the
 * entire production path, signature and idempotency included.
 *
 * `paidCents` overrides the amount, which is how an underpaid charge is
 * reproduced without touching the gateway.
 */
dev.post("/dev/simulate-payment", async (c) => {
  if (c.env.ENVIRONMENT === "production" || c.env.PAYMENT_PROVIDER !== "mock") {
    // A route that marks orders as paid must not exist outside the mock.
    throw new ApiError(403, "Rota disponível apenas em desenvolvimento com o provedor simulado.");
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    publicId?: string;
    paidCents?: number;
  };
  if (!body.publicId) throw badRequest("Informe o publicId do pedido.");

  const [order] = await db(c.env)
    .select({ chargeId: schema.orders.providerChargeId })
    .from(schema.orders)
    .where(eq(schema.orders.publicId, body.publicId))
    .limit(1);

  if (!order?.chargeId) throw notFound("Pedido");

  const mock = new MockProvider(c.env.SESSIONS, c.env.SESSION_SECRET);
  if (!(await mock.simulatePayment(order.chargeId, body.paidCents))) {
    throw notFound("Cobrança simulada (pode ter expirado no KV)");
  }

  const { body: webhookBody, signature } = await mock.buildWebhook(order.chargeId);
  const origin = new URL(c.req.url).origin;

  const response = await fetch(`${origin}/api/webhook/pix`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mock-signature": signature },
    body: webhookBody,
  });

  return c.json({ ok: response.ok, webhookStatus: response.status });
});
