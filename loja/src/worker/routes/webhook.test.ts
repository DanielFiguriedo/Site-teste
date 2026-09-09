import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { hmacSha256Hex } from "../payments/provider";
import { isUniqueViolation } from "../lib/sqlite-errors";
import {
  chargeIdOf,
  createOrder,
  json,
  orderStatus,
  payOrder,
  request,
  seedCatalog,
} from "../../test/helpers";

const SECRET = "test-session-secret";

/** Builds a webhook signed the way the mock provider signs one. */
async function signedWebhook(chargeId: string, eventId = `evt_${crypto.randomUUID()}`) {
  const body = JSON.stringify({
    id: eventId,
    type: "payment",
    action: "payment.updated",
    data: { id: chargeId },
  });
  return { body, signature: await hmacSha256Hex(SECRET, body) };
}

async function postWebhook(body: string, signature: string | null) {
  return request("/api/webhook/pix", {
    method: "POST",
    headers: signature ? { "x-mock-signature": signature } : {},
    body,
  });
}

describe("POST /api/webhook/pix — signature", () => {
  it("rejects a request with no signature", async () => {
    const { body } = await signedWebhook("mock_x");
    expect((await postWebhook(body, null)).status).toBe(401);
  });

  it("rejects an invalid signature", async () => {
    const { body } = await signedWebhook("mock_x");
    expect((await postWebhook(body, "0".repeat(64))).status).toBe(401);
  });

  it("rejects a body altered after signing", async () => {
    const { signature } = await signedWebhook("mock_x");
    const tampered = JSON.stringify({
      id: "evt_1",
      type: "payment",
      action: "payment.updated",
      data: { id: "mock_other" },
    });
    expect((await postWebhook(tampered, signature)).status).toBe(401);
  });

  it("does not credit an order when the signature is wrong", async () => {
    await seedCatalog();
    const order = await createOrder();
    const chargeId = await chargeIdOf(order.publicId);

    const { body } = await signedWebhook(chargeId);
    await postWebhook(body, "0".repeat(64));

    expect(await orderStatus(order.publicId)).toBe("awaiting_payment");
  });
});

describe("POST /api/webhook/pix — idempotency", () => {
  it("accepts the first delivery and marks the resend as duplicate", async () => {
    const { body, signature } = await signedWebhook("mock_unknown");

    const first = await postWebhook(body, signature);
    const second = await postWebhook(body, signature);

    expect(first.status).toBe(200);
    expect(await json(first)).toEqual({ ok: true });
    expect(second.status).toBe(200);
    expect(await json(second)).toEqual({ ok: true, duplicate: true });
  });

  it("records the event exactly once", async () => {
    const { body, signature } = await signedWebhook("mock_unknown", "evt_fixed");

    await postWebhook(body, signature);
    await postWebhook(body, signature);
    await postWebhook(body, signature);

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM webhook_events WHERE event_id = 'evt_fixed'`,
    ).first<{ total: number }>();

    expect(row?.total).toBe(1);
  });

  it("does not pay the same order twice", async () => {
    await seedCatalog({ stock: 5 });
    const order = await createOrder({ quantity: 1 });

    await payOrder(order.publicId);
    await payOrder(order.publicId);
    await payOrder(order.publicId);

    const product = await env.DB.prepare(`SELECT stock FROM products WHERE slug = ?`)
      .bind("vip-ouro-30")
      .first<{ stock: number }>();

    // Stock is decremented once, not once per delivery of the event.
    expect(await orderStatus(order.publicId)).toBe("paid");
    expect(product?.stock).toBe(4);
  });

  it("ignores an event that is not a payment", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "plan", data: { id: "x" } });
    const signature = await hmacSha256Hex(SECRET, body);

    const response = await postWebhook(body, signature);

    expect(await json(response)).toEqual({ ok: true, ignored: true });
  });
});

describe("payment confirmation", () => {
  it("marks a matching payment as paid and decrements stock", async () => {
    await seedCatalog({ priceCents: 1990, stock: 10 });
    const order = await createOrder({ quantity: 2 });

    await payOrder(order.publicId);

    const product = await env.DB.prepare(`SELECT stock FROM products WHERE slug = ?`)
      .bind("vip-ouro-30")
      .first<{ stock: number }>();

    expect(await orderStatus(order.publicId)).toBe("paid");
    expect(product?.stock).toBe(8);
  });

  it("leaves unlimited stock alone", async () => {
    await seedCatalog({ stock: null });
    const order = await createOrder();

    await payOrder(order.publicId);

    const product = await env.DB.prepare(`SELECT stock FROM products WHERE slug = ?`)
      .bind("vip-ouro-30")
      .first<{ stock: number | null }>();

    expect(product?.stock).toBeNull();
  });

  it("sends an underpaid order to review instead of crediting it", async () => {
    await seedCatalog({ priceCents: 2000 });
    const order = await createOrder();

    // The buyer pays R$ 1,00 on a R$ 20,00 order.
    await payOrder(order.publicId, 100);

    const row = await env.DB.prepare(
      `SELECT status, admin_note AS adminNote FROM orders WHERE public_id = ?`,
    )
      .bind(order.publicId)
      .first<{ status: string; adminNote: string }>();

    expect(row?.status).toBe("needs_review");
    expect(row?.adminNote).toContain("Valor pago");
  });

  it("sends an overpaid order to review as well", async () => {
    await seedCatalog({ priceCents: 2000 });
    const order = await createOrder();

    await payOrder(order.publicId, 5000);

    expect(await orderStatus(order.publicId)).toBe("needs_review");
  });

  it("does not decrement stock for an order under review", async () => {
    await seedCatalog({ priceCents: 2000, stock: 3 });
    const order = await createOrder();

    await payOrder(order.publicId, 100);

    const product = await env.DB.prepare(`SELECT stock FROM products WHERE slug = ?`)
      .bind("vip-ouro-30")
      .first<{ stock: number }>();

    expect(product?.stock).toBe(3);
  });

  it("flags a payment that lands after the order expired", async () => {
    await seedCatalog();
    const order = await createOrder();
    await env.DB.prepare(`UPDATE orders SET status = 'expired' WHERE public_id = ?`)
      .bind(order.publicId)
      .run();

    await payOrder(order.publicId);

    const row = await env.DB.prepare(
      `SELECT status, admin_note AS adminNote FROM orders WHERE public_id = ?`,
    )
      .bind(order.publicId)
      .first<{ status: string; adminNote: string }>();

    // The money really did arrive; it cannot vanish just because the QR expired.
    expect(row?.status).toBe("needs_review");
    expect(row?.adminNote).toContain("depois de o pedido expirar");
  });

  it("flags a payment that lands on a cancelled order", async () => {
    await seedCatalog();
    const order = await createOrder();
    // Cancelling here does not cancel the charge at the gateway: the buyer may
    // still have the QR open, and paying it puts real money in the account.
    await env.DB.prepare(`UPDATE orders SET status = 'cancelled' WHERE public_id = ?`)
      .bind(order.publicId)
      .run();

    await payOrder(order.publicId);

    const row = await env.DB.prepare(
      `SELECT status, admin_note AS adminNote FROM orders WHERE public_id = ?`,
    )
      .bind(order.publicId)
      .first<{ status: string; adminNote: string }>();

    expect(row?.status).toBe("needs_review");
    expect(row?.adminNote).toContain("cancelado");
  });

  it("annotates the order when stock does not cover the sale", async () => {
    await seedCatalog({ priceCents: 1000, stock: 5 });
    const order = await createOrder({ quantity: 2 });

    // Someone empties the stock in the admin panel between charge and payment.
    await env.DB.prepare(`UPDATE products SET stock = 1 WHERE slug = 'vip-ouro-30'`).run();
    await payOrder(order.publicId);

    const row = await env.DB.prepare(
      `SELECT status, admin_note AS adminNote FROM orders WHERE public_id = ?`,
    )
      .bind(order.publicId)
      .first<{ status: string; adminNote: string }>();

    expect(row?.status).toBe("paid");
    expect(row?.adminNote).toContain("Estoque insuficiente");
  });
});

/**
 * Telling "repeated event" apart from "the database failed" decides whether the
 * gateway resends or gives up. Treating an infrastructure failure as a duplicate
 * makes Mercado Pago stop resending an event that was never processed — a lost
 * payment.
 */
describe("isUniqueViolation", () => {
  it("recognises the D1 error wrapped by Drizzle", () => {
    // Real shape: Drizzle's `message` never mentions UNIQUE; only `cause` does.
    const fromD1 = new Error(
      "D1_ERROR: UNIQUE constraint failed: webhook_events.provider, " +
        "webhook_events.event_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)",
    );
    const fromDrizzle = new Error('Failed query: insert into "webhook_events" ...', {
      cause: fromD1,
    });

    expect(isUniqueViolation(fromDrizzle)).toBe(true);
  });

  it("recognises the bare error, with no wrapper", () => {
    expect(isUniqueViolation(new Error("UNIQUE constraint failed: x.y"))).toBe(true);
  });

  it("does NOT treat an infrastructure failure as a duplicate", () => {
    expect(isUniqueViolation(new Error("Network connection lost."))).toBe(false);
    expect(isUniqueViolation(new Error("D1_ERROR: no such table: webhook_events"))).toBe(false);
    expect(isUniqueViolation(new Error("Failed query: insert into ..."))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it("does not loop forever on circular causes", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b", { cause: a });
    a.cause = b;
    expect(isUniqueViolation(a)).toBe(false);
  });
});
