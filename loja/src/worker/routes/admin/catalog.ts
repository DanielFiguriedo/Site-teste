import { Hono } from "hono";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "../../db/client";
import { notFound, badRequest, ApiError } from "../../lib/errors";
import { slugify } from "../../lib/slug";
import { IMAGE_KEY_PATTERN } from "../../lib/images";
import { isUniqueViolation } from "../../lib/sqlite-errors";
import { toProduct } from "../../lib/serializers";
import type { AppEnv } from "../../env";

export const adminCatalog = new Hono<AppEnv>();

const productSchema = z.object({
  categoryId: z.number().int().positive(),
  slug: z.string().trim().max(100).optional(),
  name: z.string().trim().min(2).max(120),
  shortDescription: z.string().trim().max(200).nullable().optional(),
  descriptionMd: z.string().max(4000).nullable().optional(),
  priceCents: z.number().int().min(1).max(10_000_000),
  originalPriceCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  durationDays: z.number().int().min(1).max(3650).nullable().optional(),
  // Only a key the upload route produced. An arbitrary string here would let a
  // product point at any other object in the bucket.
  imageKey: z.string().regex(IMAGE_KEY_PATTERN).nullable().optional(),
  giftable: z.boolean().optional(),
  payWhatYouWant: z.boolean().optional(),
  featured: z.boolean().optional(),
  stock: z.number().int().min(0).max(100000).nullable().optional(),
  position: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

/** Lists ALL products, inactive ones included — the storefront shows only active. */
adminCatalog.get("/admin/products", async (c) => {
  const rows = await db(c.env)
    .select({ product: schema.products, category: schema.categories })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
    .orderBy(asc(schema.categories.position), asc(schema.products.position));

  return c.json(
    rows.map((row) => ({ ...toProduct(row.product, row.category), active: row.product.active })),
  );
});

adminCatalog.post("/admin/products", async (c) => {
  const parsed = productSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados do produto inválidos.", parsed.error.issues);

  const data = parsed.data;
  const slug = slugify(data.slug || data.name);
  if (!slug) throw badRequest("Não foi possível gerar um endereço para este nome.");

  try {
    const [created] = await db(c.env)
      .insert(schema.products)
      .values({ ...data, slug })
      .returning({ id: schema.products.id, slug: schema.products.slug });
    return c.json(created, 201);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ApiError(409, `Já existe um produto com o endereço "${slug}".`);
    }
    throw e;
  }
});

adminCatalog.put("/admin/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = productSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados do produto inválidos.", parsed.error.issues);

  const { slug, ...rest } = parsed.data;
  const updated = await db(c.env)
    .update(schema.products)
    .set({ ...rest, ...(slug ? { slug: slugify(slug) } : {}) })
    .where(eq(schema.products.id, id))
    .returning({ id: schema.products.id });

  if (updated.length === 0) throw notFound("Produto");
  return c.json({ ok: true });
});

/**
 * Product removal.
 *
 * A product that has already been sold is only deactivated: deleting it would
 * break the integrity of `order_items` and erase the sales history.
 */
adminCatalog.delete("/admin/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const database = db(c.env);

  const sold = await database
    .select({ id: schema.orderItems.id })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.productId, id))
    .limit(1);

  if (sold.length > 0) {
    await database.update(schema.products).set({ active: false }).where(eq(schema.products.id, id));
    return c.json({ ok: true, deactivated: true });
  }

  await database.delete(schema.products).where(eq(schema.products.id, id));
  return c.json({ ok: true, deleted: true });
});

const categorySchema = z.object({
  slug: z.string().trim().max(100).optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).nullable().optional(),
  icon: z.enum(["crown", "coins", "package", "key"]).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

adminCatalog.get("/admin/categories", async (c) => {
  const rows = await db(c.env)
    .select()
    .from(schema.categories)
    .orderBy(asc(schema.categories.position));
  return c.json(rows);
});

adminCatalog.post("/admin/categories", async (c) => {
  const parsed = categorySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados da categoria inválidos.");

  const data = parsed.data;
  const [created] = await db(c.env)
    .insert(schema.categories)
    .values({ ...data, slug: slugify(data.slug || data.name) })
    .returning({ id: schema.categories.id });

  return c.json(created, 201);
});

adminCatalog.put("/admin/categories/:id", async (c) => {
  const parsed = categorySchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados da categoria inválidos.");

  const { slug, ...rest } = parsed.data;
  const updated = await db(c.env)
    .update(schema.categories)
    .set({ ...rest, ...(slug ? { slug: slugify(slug) } : {}) })
    .where(eq(schema.categories.id, Number(c.req.param("id"))))
    .returning({ id: schema.categories.id });

  if (updated.length === 0) throw notFound("Categoria");
  return c.json({ ok: true });
});

adminCatalog.delete("/admin/categories/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const database = db(c.env);

  const withProducts = await database
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(eq(schema.products.categoryId, id))
    .limit(1);

  if (withProducts.length > 0) {
    throw new ApiError(409, "Mova ou remova os produtos desta categoria antes de excluí-la.");
  }

  await database.delete(schema.categories).where(eq(schema.categories.id, id));
  return c.json({ ok: true });
});

/** Store settings: everything the owner changes without a deploy. */
const SETTING_KEYS = [
  "server_name",
  "server_ip",
  "logo_url",
  "discord_invite",
  "delivery_time",
  "delivery_notice",
  "terms_md",
  "refund_policy_md",
] as const;

/**
 * Settings whose value ends up in a `src` or an `href`.
 *
 * A `javascript:` URL stored here would run the moment the store rendered it,
 * and React does not escape a URL scheme. Only an absolute https address or a
 * path inside the store is accepted.
 *
 * The check resolves the value instead of reading its first characters:
 * `//evil.com` and `/\evil.com` are both paths to a prefix test and both
 * another origin to a browser, which reads a backslash as a slash.
 */
const URL_SETTINGS = new Set<string>(["logo_url", "discord_invite"]);

/** Any origin, as long as it is not one a stored value could reach. */
const RESOLVE_AGAINST = "https://store.invalid";

function isSafeUrl(value: string): boolean {
  if (value === "") return true;
  try {
    const resolved = new URL(value, RESOLVE_AGAINST);
    // Still inside the store: a genuine path.
    if (resolved.origin === RESOLVE_AGAINST) return true;
    // Leaves the store, so it has to say so: `//evil.test` and `/\evil.test`
    // reach another origin while reading as a local path.
    return value.toLowerCase().startsWith("https://");
  } catch {
    return false;
  }
}

adminCatalog.get("/admin/settings", async (c) => {
  const rows = await db(c.env).select().from(schema.settings);
  return c.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
});

adminCatalog.put("/admin/settings", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, string> | null;
  if (!body) throw badRequest("Corpo inválido.");

  const database = db(c.env);
  for (const [key, value] of Object.entries(body)) {
    // Closed list: without it any key at all would land in the settings table.
    if (!SETTING_KEYS.includes(key as (typeof SETTING_KEYS)[number])) continue;

    // An address is stored exactly as it was validated: checking the trimmed
    // value and storing the untrimmed one would defeat the check.
    const stored = (URL_SETTINGS.has(key) ? String(value).trim() : String(value)).slice(0, 4000);

    if (URL_SETTINGS.has(key) && !isSafeUrl(stored)) {
      throw badRequest(`O endereço em "${key}" precisa começar com https:// ou com /.`);
    }

    await database
      .insert(schema.settings)
      .values({ key, value: stored })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: stored, updatedAt: Math.floor(Date.now() / 1000) },
      });
  }

  return c.json({ ok: true });
});
