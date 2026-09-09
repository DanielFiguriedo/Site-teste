import { Hono } from "hono";
import { z } from "zod";
import { and, desc, inArray, sql } from "drizzle-orm";
import { db, schema } from "../../db/client";
import { changeStatus } from "../../lib/orders";
import { badRequest } from "../../lib/errors";
import { toIso } from "../../lib/serializers";
import { ORDER_STATUSES } from "@shared/types";
import type { AppEnv } from "../../env";

export const adminOrders = new Hono<AppEnv>();

/**
 * Order queue.
 *
 * Defaults to **paid** — that is the owner's daily job: see who paid and has
 * not received yet. Other statuses come through an explicit filter.
 */
adminOrders.get("/admin/orders", async (c) => {
  const filter = c.req.query("status") ?? "paid";
  const page = Math.max(0, Number(c.req.query("page") ?? 0));
  const perPage = 25;

  const conditions =
    filter === "all"
      ? []
      : [
          inArray(
            schema.orders.status,
            filter
              .split(",")
              .filter((s): s is (typeof ORDER_STATUSES)[number] =>
                (ORDER_STATUSES as readonly string[]).includes(s),
              ),
          ),
        ];

  const rows = await db(c.env)
    .select()
    .from(schema.orders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.orders.createdAt))
    .limit(perPage)
    .offset(page * perPage);

  // One query for the items of every order on the page, instead of one per
  // order — rows read is exactly what the D1 free tier bills.
  const ids = rows.map((row) => row.id);
  const items =
    ids.length > 0
      ? await db(c.env)
          .select()
          .from(schema.orderItems)
          .where(inArray(schema.orderItems.orderId, ids))
      : [];

  const byOrder = new Map<number, typeof items>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }

  return c.json({
    orders: rows.map((order) => ({
      publicId: order.publicId,
      nick: order.nick,
      platform: order.platform,
      recipientNick: order.recipientNick,
      email: order.email,
      status: order.status,
      totalCents: order.totalCents,
      adminNote: order.adminNote,
      deliveredBy: order.deliveredBy,
      createdAt: toIso(order.createdAt),
      paidAt: toIso(order.paidAt),
      deliveredAt: toIso(order.deliveredAt),
      items: (byOrder.get(order.id) ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        priceCents: item.priceCents,
      })),
    })),
    page,
    hasMore: rows.length === perPage,
  });
});

/** Counters for the top of the panel — the "how many are left today". */
adminOrders.get("/admin/orders/summary", async (c) => {
  const rows = await db(c.env)
    .select({ status: schema.orders.status, total: sql<number>`count(*)` })
    .from(schema.orders)
    .groupBy(schema.orders.status);

  const [revenue] = await db(c.env)
    .select({ sum: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)` })
    .from(schema.orders)
    .where(inArray(schema.orders.status, ["paid", "delivered"]));

  return c.json({
    byStatus: Object.fromEntries(rows.map((row) => [row.status, row.total])),
    revenueCents: revenue?.sum ?? 0,
  });
});

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().max(500).optional(),
});

/**
 * Changes an order's status. Transition validation lives in `changeStatus`,
 * which refuses any invalid path (delivering twice, "un-paying" and so on).
 */
adminOrders.post("/admin/orders/:publicId/status", async (c) => {
  const parsed = statusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Status inválido.");

  await changeStatus(
    c.env,
    c.req.param("publicId"),
    parsed.data.status,
    c.get("adminEmail") ?? "admin",
    parsed.data.note,
  );

  return c.json({ ok: true });
});
