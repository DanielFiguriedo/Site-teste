import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { Category, Product, StoreSettings } from "@shared/types";
import { json, request, seedCatalog } from "../../test/helpers";

describe("GET /api/products", () => {
  it("returns only active products", async () => {
    await seedCatalog({ slug: "visible", name: "VISÍVEL" });
    await seedCatalog({ slug: "hidden", name: "OCULTO", active: false });

    const products = await json<Product[]>(await request("/api/products"));

    expect(products.map((p) => p.slug)).toEqual(["visible"]);
  });

  it("filters by category slug", async () => {
    await seedCatalog({ slug: "vip-item", categorySlug: "vip", categoryName: "VIP" });
    await seedCatalog({ slug: "cash-item", categorySlug: "cash", categoryName: "Cash" });

    const products = await json<Product[]>(await request("/api/products?category=cash"));

    expect(products).toHaveLength(1);
    expect(products[0].slug).toBe("cash-item");
    expect(products[0].categoryName).toBe("Cash");
  });

  it("filters by featured", async () => {
    await seedCatalog({ slug: "plain" });
    await seedCatalog({ slug: "starred", featured: true });

    const products = await json<Product[]>(await request("/api/products?featured=1"));

    expect(products.map((p) => p.slug)).toEqual(["starred"]);
  });

  it("hides an original price that is not actually a discount", async () => {
    const { categoryId } = await seedCatalog({ slug: "base" });
    await env.DB.prepare(
      `INSERT INTO products (category_id, slug, name, price_cents, original_price_cents)
       VALUES (?, 'no-sale', 'SEM PROMOÇÃO', 2000, 1500)`,
    )
      .bind(categoryId)
      .run();

    const products = await json<Product[]>(await request("/api/products"));
    const product = products.find((p) => p.slug === "no-sale");

    // An original price at or below the current one is noise, not a sale.
    expect(product?.originalPriceCents).toBeNull();
  });

  it("returns an empty list rather than an error when nothing is on sale", async () => {
    const response = await request("/api/products");
    expect(response.status).toBe(200);
    expect(await json<Product[]>(response)).toEqual([]);
  });
});

describe("GET /api/products/:slug", () => {
  it("returns the product with its category attached", async () => {
    await seedCatalog({ slug: "vip-ouro-30", name: "VIP OURO [30 DIAS]", priceCents: 1990 });

    const product = await json<Product>(await request("/api/products/vip-ouro-30"));

    expect(product.name).toBe("VIP OURO [30 DIAS]");
    expect(product.priceCents).toBe(1990);
    expect(product.categorySlug).toBe("vip");
  });

  it("404s on an unknown slug", async () => {
    expect((await request("/api/products/does-not-exist")).status).toBe(404);
  });

  it("404s on an inactive product, so a stale link cannot be bought", async () => {
    await seedCatalog({ slug: "retired", active: false });
    expect((await request("/api/products/retired")).status).toBe(404);
  });
});

describe("GET /api/categories", () => {
  it("returns active categories ordered by position", async () => {
    await env.DB.prepare(
      `INSERT INTO categories (slug, name, position, active) VALUES
         ('second', 'Segunda', 2, 1),
         ('first', 'Primeira', 1, 1),
         ('off', 'Desativada', 3, 0)`,
    ).run();

    const categories = await json<Category[]>(await request("/api/categories"));

    expect(categories.map((c) => c.slug)).toEqual(["first", "second"]);
  });
});

describe("GET /api/settings", () => {
  it("falls back to sane defaults with an empty settings table", async () => {
    const settings = await json<StoreSettings>(await request("/api/settings"));

    expect(settings.serverName).toBe("Loja Oficial");
    expect(settings.deliveryTime).toBeTruthy();
    expect(settings.deliveryNotice).toBeTruthy();
    expect(settings.serverIp).toBeNull();
  });

  it("returns what the admin panel saved", async () => {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES
         ('server_name', 'MeuServidor'),
         ('server_ip', 'jogar.exemplo.com.br'),
         ('terms_md', '### Termos')`,
    ).run();

    const settings = await json<StoreSettings>(await request("/api/settings"));

    expect(settings.serverName).toBe("MeuServidor");
    expect(settings.serverIp).toBe("jogar.exemplo.com.br");
    expect(settings.termsMd).toBe("### Termos");
  });
});

describe("unmapped API routes", () => {
  it("returns JSON 404 instead of falling through to the SPA", async () => {
    const response = await request("/api/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
