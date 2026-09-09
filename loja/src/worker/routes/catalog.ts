import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { toCategory, toProduct } from "../lib/serializers";
import { notFound } from "../lib/errors";
import type { AppEnv } from "../env";
import type { StoreSettings } from "@shared/types";

export const catalog = new Hono<AppEnv>();

/** Public store settings (name, IP, delivery time). */
catalog.get("/settings", async (c) => {
  const rows = await db(c.env).select().from(schema.settings);
  const map = new Map(rows.map((row) => [row.key, row.value]));

  const settings: StoreSettings = {
    serverName: map.get("server_name") || "Loja Oficial",
    serverIp: map.get("server_ip") || null,
    logoUrl: map.get("logo_url") || null,
    discordInvite: map.get("discord_invite") || null,
    deliveryTime: map.get("delivery_time") || "em até 24 horas",
    deliveryNotice:
      map.get("delivery_notice") ||
      "A entrega é feita manualmente pela nossa equipe após a confirmação do Pix.",
    termsMd: map.get("terms_md") || null,
    refundPolicyMd: map.get("refund_policy_md") || null,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
  };
  return c.json(settings);
});

catalog.get("/categories", async (c) => {
  const rows = await db(c.env)
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.active, true))
    .orderBy(asc(schema.categories.position));

  return c.json(rows.map(toCategory));
});

/**
 * Active products. `?category=<slug>` filters; `?featured=1` returns only the
 * featured ones (used by the home page).
 */
catalog.get("/products", async (c) => {
  const categorySlug = c.req.query("category");
  const featuredOnly = c.req.query("featured") === "1";

  const filters = [eq(schema.products.active, true)];
  if (categorySlug) filters.push(eq(schema.categories.slug, categorySlug));
  if (featuredOnly) filters.push(eq(schema.products.featured, true));

  const rows = await db(c.env)
    .select({ product: schema.products, category: schema.categories })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
    .where(and(...filters))
    .orderBy(asc(schema.categories.position), asc(schema.products.position));

  return c.json(rows.map((row) => toProduct(row.product, row.category)));
});

catalog.get("/products/:slug", async (c) => {
  const [row] = await db(c.env)
    .select({ product: schema.products, category: schema.categories })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
    .where(and(eq(schema.products.slug, c.req.param("slug")), eq(schema.products.active, true)))
    .limit(1);

  if (!row) throw notFound("Produto");
  return c.json(toProduct(row.product, row.category));
});

/** Serves product images stored in R2. */
catalog.get("/images/:key{.+}", async (c) => {
  const object = await c.env.BUCKET.get(c.req.param("key"));
  if (!object) throw notFound("Imagem");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // The key embeds a content hash, so caching can be aggressive.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});
