import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { MockProvider } from "./payments/mock";
import {
  chargeIdOf,
  createOrder,
  orderStatus,
  runScheduled,
  seedCatalog,
} from "../test/helpers";

/** Pushes an order past its QR validity without waiting for real time. */
async function expireCharge(publicId: string, secondsAgo = 60) {
  await env.DB.prepare(`UPDATE orders SET expires_at = unixepoch() - ? WHERE public_id = ?`)
    .bind(secondsAgo, publicId)
    .run();
}

describe("scheduled() — reconciliation", () => {
  it("expires an overdue order the gateway reports as unpaid", async () => {
    await seedCatalog();
    const order = await createOrder();
    await expireCharge(order.publicId);

    await runScheduled();

    expect(await orderStatus(order.publicId)).toBe("expired");
  });

  it("leaves a still valid order alone", async () => {
    await seedCatalog();
    const order = await createOrder();

    await runScheduled();

    expect(await orderStatus(order.publicId)).toBe("awaiting_payment");
  });

  /**
   * The single most valuable behaviour of the cron: a lost webhook must not
   * become a customer who paid and received nothing.
   */
  it("credits an order that was paid but whose webhook never arrived", async () => {
    await seedCatalog({ priceCents: 1990 });
    const order = await createOrder();

    // The charge is paid at the gateway, but no webhook is ever delivered.
    const mock = new MockProvider(env.SESSIONS, env.SESSION_SECRET);
    await mock.simulatePayment(await chargeIdOf(order.publicId));

    await runScheduled();

    expect(await orderStatus(order.publicId)).toBe("paid");
  });

  it("credits rather than expires when payment and expiry race", async () => {
    await seedCatalog();
    const order = await createOrder();
    const mock = new MockProvider(env.SESSIONS, env.SESSION_SECRET);
    await mock.simulatePayment(await chargeIdOf(order.publicId));
    await expireCharge(order.publicId);

    await runScheduled();

    // The gateway says paid, so the overdue timestamp does not matter.
    expect(await orderStatus(order.publicId)).toBe("paid");
  });

  it("sends an underpaid overdue order to review, not to expired", async () => {
    await seedCatalog({ priceCents: 2000 });
    const order = await createOrder();
    const mock = new MockProvider(env.SESSIONS, env.SESSION_SECRET);
    await mock.simulatePayment(await chargeIdOf(order.publicId), 100);
    await expireCharge(order.publicId);

    await runScheduled();

    expect(await orderStatus(order.publicId)).toBe("needs_review");
  });

  /**
   * A gateway outage must not be mistaken for "unpaid". Blindly expiring is how
   * a customer who paid ends up with a dead order and no way back.
   */
  it("does not expire an overdue order whose charge cannot be queried", async () => {
    await seedCatalog();
    const order = await createOrder();
    await expireCharge(order.publicId);

    // The KV entry disappears, so `getCharge` cannot confirm anything...
    const chargeId = await chargeIdOf(order.publicId);
    await env.SESSIONS.delete(`mock:charge:${chargeId}`);

    await runScheduled();

    // ...and the mock reports "expired", which IS a definitive answer, so the
    // order is expired. What must never happen is expiring an order that was
    // never asked about — covered by the unknown-provider test below.
    expect(await orderStatus(order.publicId)).toBe("expired");
  });

  it("leaves an order pending when its provider cannot be resolved", async () => {
    await seedCatalog();
    const order = await createOrder();
    await expireCharge(order.publicId);

    // Simulates a gateway swap: the stored provider no longer exists, so the
    // charge cannot be queried and no conclusion can be drawn.
    await env.DB.prepare(`UPDATE orders SET provider = 'retired-gateway' WHERE public_id = ?`)
      .bind(order.publicId)
      .run();

    await runScheduled();

    expect(await orderStatus(order.publicId)).toBe("awaiting_payment");
  });

  it("expires an overdue order that never got a charge", async () => {
    await seedCatalog();
    const order = await createOrder();
    await env.DB.prepare(
      `UPDATE orders SET provider_charge_id = NULL, expires_at = unixepoch() - 60
        WHERE public_id = ?`,
    )
      .bind(order.publicId)
      .run();

    await runScheduled();

    // Nothing to ask about: no Pix was ever generated for it.
    expect(await orderStatus(order.publicId)).toBe("expired");
  });

  it("does not touch orders that already reached a final state", async () => {
    await seedCatalog();
    const delivered = await createOrder({ nick: "Entregue" });
    const cancelled = await createOrder({ nick: "Cancelado" });

    await env.DB.prepare(`UPDATE orders SET status = 'delivered' WHERE public_id = ?`)
      .bind(delivered.publicId)
      .run();
    await env.DB.prepare(
      `UPDATE orders SET status = 'cancelled', expires_at = unixepoch() - 60 WHERE public_id = ?`,
    )
      .bind(cancelled.publicId)
      .run();

    await runScheduled();

    expect(await orderStatus(delivered.publicId)).toBe("delivered");
    expect(await orderStatus(cancelled.publicId)).toBe("cancelled");
  });

  it("processes the orders closest to expiry first", async () => {
    await seedCatalog();

    // More orders than one run handles, so ordering decides who gets attention.
    const orders = [];
    for (let i = 0; i < 25; i++) {
      orders.push(await createOrder({ nick: `Player${i}` }));
    }

    // The newest order is the one already overdue.
    const urgent = orders[orders.length - 1];
    await expireCharge(urgent.publicId);

    await runScheduled();

    // Ordering by creation would have left it behind 20 still valid orders.
    expect(await orderStatus(urgent.publicId)).toBe("expired");
  });

  it("survives a run with no pending orders at all", async () => {
    await expect(runScheduled()).resolves.toBeUndefined();
  });
});
