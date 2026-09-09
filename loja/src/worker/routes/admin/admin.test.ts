import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { Category, Product } from "@shared/types";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createOrder,
  json,
  orderStatus,
  payOrder,
  request,
  seedAdmin,
  seedCatalog,
  signIn,
  uploadImage,
} from "../../../test/helpers";

/**
 * Every protected route, checked without a session.
 *
 * Hiding a screen in the front-end protects nothing — anyone can call the
 * endpoint directly. This list is the actual guard, and it must grow whenever a
 * new admin route is added.
 */
const PROTECTED: [string, string][] = [
  ["GET", "/api/admin/me"],
  ["GET", "/api/admin/orders"],
  ["GET", "/api/admin/orders/summary"],
  ["POST", "/api/admin/orders/any-id/status"],
  ["GET", "/api/admin/products"],
  ["POST", "/api/admin/products"],
  ["PUT", "/api/admin/products/1"],
  ["DELETE", "/api/admin/products/1"],
  ["GET", "/api/admin/categories"],
  ["POST", "/api/admin/categories"],
  ["PUT", "/api/admin/categories/1"],
  ["DELETE", "/api/admin/categories/1"],
  ["GET", "/api/admin/settings"],
  ["PUT", "/api/admin/settings"],
  ["POST", "/api/admin/upload"],
  ["DELETE", "/api/admin/upload/products/000000000000000000000000.png"],
];

describe("admin authentication", () => {
  it.each(PROTECTED)("refuses %s %s without a session", async (method, path) => {
    const response = await request(path, {
      method,
      body: method === "GET" || method === "DELETE" ? undefined : "{}",
    });
    expect(response.status).toBe(401);
  });

  it("refuses a forged session cookie", async () => {
    const response = await request("/api/admin/orders", {
      cookie: "store_admin=made.up.token",
    });
    expect(response.status).toBe(401);
  });

  it("signs in with the right password", async () => {
    await seedAdmin();
    const response = await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  });

  it("refuses a wrong password and an unknown e-mail with the same message", async () => {
    await seedAdmin();

    const wrongPassword = await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "wrong" }),
    });
    const unknownEmail = await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email: "nobody@example.com", password: ADMIN_PASSWORD }),
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Telling them apart would hand over the list of valid e-mails for free.
    expect(await json<{ error: string }>(wrongPassword)).toEqual(
      await json<{ error: string }>(unknownEmail),
    );
  });

  it("accepts a session cookie on a protected route", async () => {
    const cookie = await signIn();
    const response = await request("/api/admin/me", { cookie });

    expect(response.status).toBe(200);
    expect((await json<{ email: string }>(response)).email).toBe(ADMIN_EMAIL);
  });

  it("revokes the session on sign out, not just the cookie", async () => {
    const cookie = await signIn();
    await request("/api/admin/logout", { method: "POST", cookie });

    // Replaying the same cookie must fail: the session is gone from KV.
    expect((await request("/api/admin/me", { cookie })).status).toBe(401);
  });

  it("records the last login timestamp", async () => {
    await signIn();
    const row = await env.DB.prepare(
      `SELECT last_login_at AS lastLoginAt FROM admin_users WHERE email = ?`,
    )
      .bind(ADMIN_EMAIL)
      .first<{ lastLoginAt: number | null }>();

    expect(row?.lastLoginAt).toBeTypeOf("number");
  });
});

describe("admin products", () => {
  it("lists inactive products too, unlike the storefront", async () => {
    await seedCatalog({ slug: "visible" });
    await seedCatalog({ slug: "hidden", active: false });

    const cookie = await signIn();
    const products = await json<(Product & { active: boolean })[]>(
      await request("/api/admin/products", { cookie }),
    );

    expect(products.map((p) => p.slug).sort()).toEqual(["hidden", "visible"]);
  });

  it("creates a product and derives the slug from the name", async () => {
    const { categoryId } = await seedCatalog({ slug: "seed" });
    const cookie = await signIn();

    const response = await request("/api/admin/products", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        categoryId,
        name: "CHAVE MÍSTICA [x5]",
        priceCents: 1490,
      }),
    });

    expect(response.status).toBe(201);
    expect((await json<{ slug: string }>(response)).slug).toBe("chave-mistica-x5");
  });

  it("refuses a duplicate slug with a clear conflict", async () => {
    const { categoryId } = await seedCatalog({ slug: "vip-ouro-30-dias" });
    const cookie = await signIn();

    const response = await request("/api/admin/products", {
      method: "POST",
      cookie,
      // The same name generates the same slug, which the UNIQUE index refuses.
      body: JSON.stringify({ categoryId, name: "VIP OURO [30 DIAS]", priceCents: 1000 }),
    });

    expect(response.status).toBe(409);
  });

  it("rejects an invalid price instead of storing it", async () => {
    const { categoryId } = await seedCatalog({ slug: "seed" });
    const cookie = await signIn();

    const response = await request("/api/admin/products", {
      method: "POST",
      cookie,
      body: JSON.stringify({ categoryId, name: "GRÁTIS", priceCents: 0 }),
    });

    expect(response.status).toBe(400);
  });

  it("updates a product and the change reaches the storefront", async () => {
    await seedCatalog({ slug: "vip", priceCents: 1990 });
    const cookie = await signIn();
    const id = await productId("vip");

    await request(`/api/admin/products/${id}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ priceCents: 1790 }),
    });

    const product = await json<Product>(await request("/api/products/vip"));
    expect(product.priceCents).toBe(1790);
  });

  it("deletes a product that was never sold", async () => {
    await seedCatalog({ slug: "never-sold" });
    const cookie = await signIn();
    const id = await productId("never-sold");

    const response = await request(`/api/admin/products/${id}`, { method: "DELETE", cookie });

    expect(await json(response)).toEqual({ ok: true, deleted: true });
    expect(await productId("never-sold")).toBeUndefined();
  });

  it("deactivates instead of deleting a product that has been sold", async () => {
    await seedCatalog({ slug: "sold" });
    await createOrder({ productSlug: "sold" });
    const cookie = await signIn();
    const id = await productId("sold");

    const response = await request(`/api/admin/products/${id}`, { method: "DELETE", cookie });

    // Deleting would break order_items and erase the sales history.
    expect(await json(response)).toEqual({ ok: true, deactivated: true });
    expect(await productId("sold")).toBe(id);
  });
});

describe("admin categories", () => {
  it("refuses to delete a category that still has products", async () => {
    const { categoryId } = await seedCatalog();
    const cookie = await signIn();

    const response = await request(`/api/admin/categories/${categoryId}`, {
      method: "DELETE",
      cookie,
    });

    expect(response.status).toBe(409);
  });

  it("deletes an empty category", async () => {
    const cookie = await signIn();
    const created = await json<{ id: number }>(
      await request("/api/admin/categories", {
        method: "POST",
        cookie,
        body: JSON.stringify({ name: "Vazia" }),
      }),
    );

    const response = await request(`/api/admin/categories/${created.id}`, {
      method: "DELETE",
      cookie,
    });

    expect(response.status).toBe(200);
    const categories = await json<Category[]>(await request("/api/categories"));
    expect(categories).toHaveLength(0);
  });
});

describe("admin settings", () => {
  it("saves a known key and ignores an unknown one", async () => {
    const cookie = await signIn();

    await request("/api/admin/settings", {
      method: "PUT",
      cookie,
      body: JSON.stringify({ server_name: "MeuServidor", evil_key: "should not be stored" }),
    });

    const rows = await env.DB.prepare(`SELECT key FROM settings`).all<{ key: string }>();
    expect(rows.results.map((r) => r.key)).toEqual(["server_name"]);
  });
});

describe("admin order queue", () => {
  it("defaults to the paid orders, which is the daily job", async () => {
    await seedCatalog();
    const pending = await createOrder({ nick: "Pendente" });
    const paid = await createOrder({ nick: "Pago" });
    await payOrder(paid.publicId);

    const cookie = await signIn();
    const list = await json<{ orders: { publicId: string }[] }>(
      await request("/api/admin/orders", { cookie }),
    );

    expect(list.orders.map((o) => o.publicId)).toEqual([paid.publicId]);
    expect(list.orders.map((o) => o.publicId)).not.toContain(pending.publicId);
  });

  it("filters by any status and by all", async () => {
    await seedCatalog();
    const paid = await createOrder();
    await payOrder(paid.publicId);
    await createOrder({ nick: "Outro" });

    const cookie = await signIn();
    const pendingList = await json<{ orders: unknown[] }>(
      await request("/api/admin/orders?status=awaiting_payment", { cookie }),
    );
    const all = await json<{ orders: unknown[] }>(
      await request("/api/admin/orders?status=all", { cookie }),
    );

    expect(pendingList.orders).toHaveLength(1);
    expect(all.orders).toHaveLength(2);
  });

  it("summarises counts and revenue from paid and delivered orders only", async () => {
    await seedCatalog({ priceCents: 1000 });
    const paid = await createOrder();
    await payOrder(paid.publicId);
    await createOrder({ nick: "NaoPago" });

    const cookie = await signIn();
    const summary = await json<{
      byStatus: Record<string, number>;
      revenueCents: number;
    }>(await request("/api/admin/orders/summary", { cookie }));

    expect(summary.byStatus.paid).toBe(1);
    expect(summary.byStatus.awaiting_payment).toBe(1);
    // An unpaid order is not revenue.
    expect(summary.revenueCents).toBe(1000);
  });

  it("marks an order as delivered and records who did it", async () => {
    await seedCatalog();
    const order = await createOrder();
    await payOrder(order.publicId);
    const cookie = await signIn();

    const response = await request(`/api/admin/orders/${order.publicId}/status`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ status: "delivered" }),
    });

    const row = await env.DB.prepare(
      `SELECT status, delivered_by AS deliveredBy, delivered_at AS deliveredAt
         FROM orders WHERE public_id = ?`,
    )
      .bind(order.publicId)
      .first<{ status: string; deliveredBy: string; deliveredAt: number }>();

    expect(response.status).toBe(200);
    expect(row?.status).toBe("delivered");
    expect(row?.deliveredBy).toBe(ADMIN_EMAIL);
    expect(row?.deliveredAt).toBeTypeOf("number");
  });

  it("refuses an invalid transition", async () => {
    await seedCatalog();
    const order = await createOrder();
    await payOrder(order.publicId);
    const cookie = await signIn();

    await request(`/api/admin/orders/${order.publicId}/status`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ status: "delivered" }),
    });

    // Delivering twice, and un-delivering, are both refused.
    const twice = await request(`/api/admin/orders/${order.publicId}/status`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ status: "delivered" }),
    });
    const backwards = await request(`/api/admin/orders/${order.publicId}/status`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ status: "paid" }),
    });

    expect(twice.status).toBe(409);
    expect(backwards.status).toBe(409);
  });

  it("releases an order that was under review", async () => {
    await seedCatalog({ priceCents: 2000 });
    const order = await createOrder();
    await payOrder(order.publicId, 100);
    expect(await orderStatus(order.publicId)).toBe("needs_review");

    const cookie = await signIn();
    await request(`/api/admin/orders/${order.publicId}/status`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ status: "paid", note: "Conferido no painel do gateway." }),
    });

    const row = await env.DB.prepare(
      `SELECT status, admin_note AS adminNote FROM orders WHERE public_id = ?`,
    )
      .bind(order.publicId)
      .first<{ status: string; adminNote: string }>();

    expect(row?.status).toBe("paid");
    expect(row?.adminNote).toBe("Conferido no painel do gateway.");
  });

  it("rejects an unknown status value", async () => {
    await seedCatalog();
    const order = await createOrder();
    const cookie = await signIn();

    const response = await request(`/api/admin/orders/${order.publicId}/status`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ status: "teleported" }),
    });

    expect(response.status).toBe(400);
  });

  it("404s when changing the status of an order that does not exist", async () => {
    const cookie = await signIn();
    const response = await request("/api/admin/orders/ghost/status", {
      method: "POST",
      cookie,
      body: JSON.stringify({ status: "delivered" }),
    });

    expect(response.status).toBe(404);
  });
});

describe("admin image upload", () => {
  it("stores the image in R2 and returns a URL that serves it", async () => {
    const cookie = await signIn();
    const { response, body } = await uploadImage(cookie);

    expect(response.status).toBe(201);
    expect(body.key).toMatch(/^products\/[0-9a-f]{24}\.png$/);
    expect((await request(body.url)).status).toBe(200);
  });

  it("refuses a type that is not on the allow list", async () => {
    const cookie = await signIn();
    const form = new FormData();
    // SVG is excluded on purpose: it can carry script.
    form.append("file", new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));

    expect((await request("/api/admin/upload", { method: "POST", cookie, body: form })).status).toBe(
      400,
    );
  });

  it("refuses a request with no file", async () => {
    const cookie = await signIn();
    const response = await request("/api/admin/upload", {
      method: "POST",
      cookie,
      body: new FormData(),
    });
    expect(response.status).toBe(400);
  });
});

async function productId(slug: string): Promise<number | undefined> {
  const row = await env.DB.prepare(`SELECT id FROM products WHERE slug = ?`)
    .bind(slug)
    .first<{ id: number }>();
  return row?.id;
}
