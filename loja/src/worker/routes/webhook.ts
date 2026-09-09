import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { getProvider } from "../payments";
import { markAsPaid } from "../lib/orders";
import { isUniqueViolation } from "../lib/sqlite-errors";
import type { AppEnv } from "../env";

export const webhook = new Hono<AppEnv>();

/**
 * Payment confirmation from the gateway.
 *
 * The order of the steps below is the security of the whole system:
 *   1. read the RAW body exactly once;
 *   2. validate the signature against that raw body (first gate);
 *   3. record the event idempotently (blocks a double credit);
 *   4. re-query the charge on the gateway API (the real defence);
 *   5. only then mark the order as paid.
 *
 * A 200 tells the gateway "received, do not resend". So it is only returned
 * once the event has actually been recorded: an infrastructure error returns
 * 500 on purpose, so the gateway re-queues.
 */
webhook.post("/webhook/pix", async (c) => {
  // Step 1 — a single read. Re-reading throws "Body has already been used",
  // and re-serialising the JSON would invalidate the signature.
  const rawBody = await c.req.text();
  const headers = c.req.raw.headers;

  const provider = getProvider(c.env);

  // Step 2.
  if (!(await provider.verifyWebhookSignature(rawBody, headers))) {
    console.warn("Rejected webhook with invalid signature.");
    return c.json({ error: "Assinatura inválida." }, 401);
  }

  const event = provider.parseEvent(rawBody, headers);
  if (!event) return c.json({ ok: true, ignored: true });

  // Step 3 — the UNIQUE on (provider, event_id) is what stops a resent event
  // from crediting the order twice.
  try {
    await db(c.env).insert(schema.webhookEvents).values({
      provider: provider.name,
      eventId: event.eventId,
      type: event.type,
      payload: rawBody.slice(0, 4000),
    });
  } catch (e) {
    if (isUniqueViolation(e)) return c.json({ ok: true, duplicate: true });

    // A transient database error treated as "duplicate" would make the gateway
    // stop resending an event that was never processed.
    console.error("Failed to record webhook event:", e);
    return c.json({ error: "Falha temporária. Reenvie." }, 500);
  }

  // Steps 4 and 5 run after the response: the gateway gets its 200 immediately
  // and does not re-queue because of our latency.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const state = await provider.getCharge(event.chargeId);
        if (state.status === "paid") {
          const outcome = await markAsPaid(c.env, event.chargeId, state.paidCents);
          console.log(`Webhook ${event.eventId} -> ${outcome}`);

          if (outcome === "unknown") {
            // Money that arrived without a matching order. There is nothing to
            // credit, but it would disappear from the logs if not said aloud.
            console.error(
              `Payment confirmed for charge ${event.chargeId}, which does not exist in the database.`,
            );
          }
        }
      } catch (e) {
        console.error(`Failed to process webhook ${event.eventId}:`, e);

        // Drop the idempotency marker so a gateway resend can try again.
        // Without this the cron would be the only remaining chance.
        await db(c.env)
          .delete(schema.webhookEvents)
          .where(
            and(
              eq(schema.webhookEvents.provider, provider.name),
              eq(schema.webhookEvents.eventId, event.eventId),
            ),
          )
          .catch(() => undefined);
      }
    })(),
  );

  return c.json({ ok: true });
});
