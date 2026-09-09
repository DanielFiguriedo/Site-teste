import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { Order } from "@shared/types";
import { createOrder, json, postCheckout, request, seedCatalog } from "../../test/helpers";

describe("POST /api/checkout — pricing", () => {
  it("computes the total from the database, times the quantity", async () => {
    await seedCatalog({ priceCents: 1990 });

    const order = await createOrder({ quantity: 2 });

    expect(order.totalCents).toBe(3980);
  });

  /**
   * The single most important test in the suite. If a price ever reaches the
   * server from the client, the whole store can be bought for one cent.
   */
  it("ignores any price the client tries to send", async () => {
    await seedCatalog({ priceCents: 14990 });

    const order = await createOrder({
      priceCents: 1,
      totalCents: 1,
      originalPriceCents: 1,
      amountCents: 1,
    });

    expect(order.totalCents).toBe(14990);
  });

  it("clamps the quantity to the allowed range", async () => {
    await seedCatalog({ priceCents: 1000 });

    expect((await postCheckout({ quantity: 999 })).status).toBe(400);
    expect((await postCheckout({ quantity: 0 })).status).toBe(400);
    expect((await postCheckout({ quantity: -5 })).status).toBe(400);
  });

  it("stores an immutable snapshot of name and price on the order item", async () => {
    await seedCatalog({ slug: "vip", name: "VIP OURO", priceCents: 1990 });
    const order = await createOrder({ productSlug: "vip" });

    // The price changes after the sale, the way the owner would change it.
    await env.DB.prepare(`UPDATE products SET price_cents = 9900, name = 'VIP NOVO'`).run();

    const item = await env.DB.prepare(
      `SELECT oi.name, oi.price_cents AS priceCents
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.public_id = ?`,
    )
      .bind(order.publicId)
      .first<{ name: string; priceCents: number }>();

    expect(item).toEqual({ name: "VIP OURO", priceCents: 1990 });
  });
});

describe("POST /api/checkout — pay what you want", () => {
  it("accepts the buyer's amount when it clears the minimum", async () => {
    await seedCatalog({ slug: "donate", payWhatYouWant: true, priceCents: 500 });

    const order = await createOrder({ productSlug: "donate", amountCents: 2500 });

    expect(order.totalCents).toBe(2500);
  });

  it("refuses an amount below the product minimum", async () => {
    await seedCatalog({ slug: "donate", payWhatYouWant: true, priceCents: 500 });

    expect((await postCheckout({ productSlug: "donate", amountCents: 100 })).status).toBe(400);
  });

  it("forces quantity to one, so the free amount cannot be multiplied", async () => {
    await seedCatalog({ slug: "donate", payWhatYouWant: true, priceCents: 500 });

    const order = await createOrder({ productSlug: "donate", amountCents: 1000, quantity: 10 });

    expect(order.totalCents).toBe(1000);
  });
});

describe("POST /api/checkout — validation", () => {
  it("404s on an unknown product", async () => {
    expect((await postCheckout({ productSlug: "ghost" })).status).toBe(404);
  });

  it("404s on an inactive product", async () => {
    await seedCatalog({ slug: "retired", active: false });
    expect((await postCheckout({ productSlug: "retired" })).status).toBe(404);
  });

  it("rejects an invalid nick", async () => {
    await seedCatalog();
    expect((await postCheckout({ nick: "ab" })).status).toBe(400);
    expect((await postCheckout({ nick: "nick-with-dash!" })).status).toBe(400);
  });

  it("requires a valid e-mail, because the gateway demands a payer", async () => {
    await seedCatalog();
    expect((await postCheckout({ email: "not-an-email" })).status).toBe(400);
    expect((await postCheckout({ email: undefined })).status).toBe(400);
  });

  it("rejects a malformed body instead of throwing", async () => {
    const response = await request("/api/checkout", { method: "POST", body: "not json" });
    expect(response.status).toBe(400);
  });

  it("refuses to gift a product that is not giftable", async () => {
    await seedCatalog({ slug: "no-gift", giftable: false });

    const response = await postCheckout({ productSlug: "no-gift", recipientNick: "Amigo" });

    expect(response.status).toBe(400);
  });

  it("records the recipient when the product is giftable", async () => {
    await seedCatalog({ slug: "gift", giftable: true });

    const created = await createOrder({ productSlug: "gift", recipientNick: "Amigo_BR" });
    const order = await json<Order>(await request(`/api/orders/${created.publicId}`));

    expect(order.recipientNick).toBe("Amigo_BR");
  });
});

describe("POST /api/checkout — stock", () => {
  it("refuses a quantity larger than the stock on hand", async () => {
    await seedCatalog({ slug: "rare", stock: 2 });

    expect((await postCheckout({ productSlug: "rare", quantity: 3 })).status).toBe(400);
    expect((await postCheckout({ productSlug: "rare", quantity: 2 })).status).toBe(201);
  });

  it("refuses to sell a product with zero stock", async () => {
    await seedCatalog({ slug: "sold-out", stock: 0 });

    expect((await postCheckout({ productSlug: "sold-out" })).status).toBe(400);
  });

  it("does not decrement stock before the payment is confirmed", async () => {
    await seedCatalog({ slug: "rare", stock: 5 });
    await createOrder({ productSlug: "rare", quantity: 2 });

    const product = await env.DB.prepare(`SELECT stock FROM products WHERE slug = 'rare'`).first<{
      stock: number;
    }>();

    expect(product?.stock).toBe(5);
  });
});

describe("POST /api/checkout — abuse brake", () => {
  it("caps how many open orders one IP can hold", async () => {
    await seedCatalog();
    const ip = "203.0.113.7";

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await postCheckout({ nick: `Flood${i}` }, ip)).status);
    }

    // Without this brake a script would flood the pending queue and drown the
    // cron reconciliation.
    expect(statuses.filter((s) => s === 201)).toHaveLength(8);
    expect(statuses.filter((s) => s === 429)).toHaveLength(4);
  });

  it("counts the limit per IP, not globally", async () => {
    await seedCatalog();

    for (let i = 0; i < 8; i++) {
      await postCheckout({ nick: `First${i}` }, "203.0.113.7");
    }

    expect((await postCheckout({ nick: "Other" }, "198.51.100.9")).status).toBe(201);
  });

  it("does not block requests with no client IP", async () => {
    await seedCatalog();

    for (let i = 0; i < 10; i++) {
      expect((await postCheckout({ nick: `NoIp${i}` })).status).toBe(201);
    }
  });
});

describe("POST /api/checkout — the created order", () => {
  it("issues a Pix charge and an unguessable public id", async () => {
    await seedCatalog();
    const created = await createOrder();

    const order = await json<Order>(await request(`/api/orders/${created.publicId}`));

    expect(created.publicId).toMatch(/^[0-9a-f]{32}$/);
    expect(order.status).toBe("awaiting_payment");
    expect(order.pixBrCode).toBeTruthy();
    expect(order.expiresAt).toBeTruthy();
  });

  it("stores the provider name, so a gateway swap does not orphan the order", async () => {
    await seedCatalog();
    const created = await createOrder();

    const row = await env.DB.prepare(`SELECT provider FROM orders WHERE public_id = ?`)
      .bind(created.publicId)
      .first<{ provider: string }>();

    expect(row?.provider).toBe("mock");
  });
});
