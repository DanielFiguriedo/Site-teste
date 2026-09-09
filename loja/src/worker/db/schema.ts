import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(unixepoch())`;

/**
 * Store categories (VIP, Cash, Kits, Keys).
 *
 * `parentId` exists from day one for when the server grows into several game
 * modes. Today every category is flat — adding the column now avoids a painful
 * migration later.
 */
export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    position: integer("position").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("idx_categories_slug").on(t.slug), index("idx_categories_position").on(t.position)],
);

/** Products for sale. All money is stored as an integer number of cents. */
export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description"),
    /** Markdown — drives the "what you get" block on the product page. */
    descriptionMd: text("description_md"),
    priceCents: integer("price_cents").notNull(),
    /** Struck-through "was" price. Null when there is no sale. */
    originalPriceCents: integer("original_price_cents"),
    saleEndsAt: integer("sale_ends_at"),
    /** Null means permanent. Set on time-limited VIP ranks (30, 90 days...). */
    durationDays: integer("duration_days"),
    /** R2 object key. The public URL is built by the Worker. */
    imageKey: text("image_key"),
    giftable: integer("giftable", { mode: "boolean" }).notNull().default(true),
    /** Donation product: the buyer picks the amount, respecting `priceCents`. */
    payWhatYouWant: integer("pay_what_you_want", { mode: "boolean" }).notNull().default(false),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    /** Null means unlimited. */
    stock: integer("stock"),
    position: integer("position").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("idx_products_slug").on(t.slug),
    index("idx_products_category").on(t.categoryId),
    index("idx_products_active_position").on(t.active, t.position),
  ],
);

/**
 * Orders.
 *
 * `publicId` is a random token used in the payment URL — the sequential `id`
 * never leaves the database, so nobody can guess a stranger's order.
 */
export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    nick: text("nick").notNull(),
    platform: text("platform", { enum: ["java", "bedrock"] }).notNull().default("java"),
    email: text("email"),
    /** Null when the buyer is purchasing for themselves. */
    recipientNick: text("recipient_nick"),
    totalCents: integer("total_cents").notNull(),
    status: text("status", {
      enum: [
        "awaiting_payment",
        "paid",
        "needs_review",
        "delivered",
        "expired",
        "cancelled",
        "refunded",
      ],
    })
      .notNull()
      .default("awaiting_payment"),
    provider: text("provider").notNull(),
    providerChargeId: text("provider_charge_id"),
    /** The Pix BR Code, shown in the UI as "copia e cola". */
    pixBrCode: text("pix_br_code"),
    pixQrBase64: text("pix_qr_base64"),
    expiresAt: integer("expires_at"),
    paidAt: integer("paid_at"),
    deliveredAt: integer("delivered_at"),
    deliveredBy: text("delivered_by"),
    adminNote: text("admin_note"),
    ip: text("ip"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("idx_orders_public_id").on(t.publicId),
    index("idx_orders_status_created").on(t.status, t.createdAt),
    index("idx_orders_charge").on(t.providerChargeId),
    index("idx_orders_nick").on(t.nick),
    index("idx_orders_ip_status").on(t.ip, t.status),
  ],
);

/**
 * Immutable snapshot of the product at purchase time.
 *
 * Repeating name and price here is deliberate: changing a product's price
 * tomorrow must not rewrite what was sold yesterday.
 */
export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull(),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    imageKey: text("image_key"),
  },
  (t) => [index("idx_order_items_order").on(t.orderId)],
);

/**
 * Webhook events already processed.
 *
 * The UNIQUE on `(provider, event_id)` is what guarantees idempotency: Mercado
 * Pago retries webhooks, and without it the same order would be marked paid
 * twice — and the owner would deliver the item twice.
 */
export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type"),
    payload: text("payload"),
    receivedAt: integer("received_at").notNull().default(now),
  },
  (t) => [uniqueIndex("idx_webhook_event_unique").on(t.provider, t.eventId)],
);

/** Admin panel users. Passwords hashed with PBKDF2 through WebCrypto. */
export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    lastLoginAt: integer("last_login_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("idx_admin_users_email").on(t.email)],
);

/** Editable store settings (key/value), so the owner never needs a deploy. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: integer("updated_at").notNull().default(now),
});
