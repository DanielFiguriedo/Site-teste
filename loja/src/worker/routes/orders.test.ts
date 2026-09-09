import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { Order } from "@shared/types";
import { createOrder, json, payOrder, request, seedCatalog } from "../../test/helpers";

describe("GET /api/orders/:publicId", () => {
  it("returns the order with its items", async () => {
    await seedCatalog({ priceCents: 1990, name: "VIP OURO [30 DIAS]" });
    const created = await createOrder({ quantity: 2, nick: "Steve_BR" });

    const order = await json<Order>(await request(`/api/orders/${created.publicId}`));

    expect(order.nick).toBe("Steve_BR");
    expect(order.totalCents).toBe(3980);
    expect(order.items).toEqual([
      {
        productId: expect.any(Number),
        name: "VIP OURO [30 DIAS]",
        priceCents: 1990,
        quantity: 2,
        imageUrl: null,
      },
    ]);
  });

  it("404s on an unknown id", async () => {
    expect((await request("/api/orders/does-not-exist")).status).toBe(404);
  });

  it("never caches, because the payment screen polls it", async () => {
    await seedCatalog();
    const created = await createOrder();

    const response = await request(`/api/orders/${created.publicId}`);

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("exposes the Pix code only while the charge is payable", async () => {
    await seedCatalog();
    const created = await createOrder();

    const pending = await json<Order>(await request(`/api/orders/${created.publicId}`));
    expect(pending.pixBrCode).toBeTruthy();

    await payOrder(created.publicId);

    // After payment the code is clutter, and could invite a second payment.
    const paid = await json<Order>(await request(`/api/orders/${created.publicId}`));
    expect(paid.status).toBe("paid");
    expect(paid.pixBrCode).toBeNull();
    expect(paid.pixQrBase64).toBeNull();
  });

  it("does not leak the buyer e-mail, the IP or the internal id", async () => {
    await seedCatalog();
    const created = await createOrder({ email: "private@example.com" }, "203.0.113.7");

    const order = await json<Record<string, unknown>>(
      await request(`/api/orders/${created.publicId}`),
    );

    // Anyone holding the link can read this response, so it must carry only
    // what the buyer already knows.
    expect(Object.keys(order).sort()).toEqual([
      "createdAt",
      "deliveredAt",
      "expiresAt",
      "items",
      "nick",
      "paidAt",
      "pixBrCode",
      "pixQrBase64",
      "platform",
      "publicId",
      "recipientNick",
      "status",
      "totalCents",
    ]);
  });

  it("reports timestamps as ISO strings", async () => {
    await seedCatalog();
    const created = await createOrder();
    await payOrder(created.publicId);

    const order = await json<Order>(await request(`/api/orders/${created.publicId}`));

    expect(order.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(order.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(order.deliveredAt).toBeNull();
  });

  it("keeps the sold item name even after the product is renamed", async () => {
    await seedCatalog({ name: "VIP OURO [30 DIAS]" });
    const created = await createOrder();

    await env.DB.prepare(`UPDATE products SET name = 'OUTRO NOME'`).run();

    const order = await json<Order>(await request(`/api/orders/${created.publicId}`));
    expect(order.items[0].name).toBe("VIP OURO [30 DIAS]");
  });
});

describe("POST /api/dev/simulate-payment", () => {
  it("400s without a public id", async () => {
    const response = await request("/api/dev/simulate-payment", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  it("404s for an order that does not exist", async () => {
    const response = await request("/api/dev/simulate-payment", {
      method: "POST",
      body: JSON.stringify({ publicId: "nope" }),
    });
    expect(response.status).toBe(404);
  });
});
