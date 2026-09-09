import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { notFound } from "../lib/errors";
import { toIso, imageUrl } from "../lib/serializers";
import type { AppEnv } from "../env";
import type { Order } from "@shared/types";

export const publicOrders = new Hono<AppEnv>();

/**
 * Public order lookup by `publicId`.
 *
 * `publicId` is a random 32-character token precisely so this address cannot be
 * guessed — the sequential id never leaves the database.
 */
publicOrders.get("/orders/:publicId", async (c) => {
  const database = db(c.env);
  const publicId = c.req.param("publicId");

  const [order] = await database
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.publicId, publicId))
    .limit(1);

  if (!order) throw notFound("Pedido");

  const items = await database
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, order.id));

  const response: Order = {
    publicId: order.publicId,
    nick: order.nick,
    platform: order.platform,
    recipientNick: order.recipientNick,
    status: order.status,
    totalCents: order.totalCents,
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      priceCents: item.priceCents,
      quantity: item.quantity,
      imageUrl: imageUrl(item.imageKey),
    })),
    // The QR is only returned while the charge is still payable; after that it
    // is clutter on screen and could invite a second payment.
    pixBrCode: order.status === "awaiting_payment" ? order.pixBrCode : null,
    pixQrBase64: order.status === "awaiting_payment" ? order.pixQrBase64 : null,
    expiresAt: toIso(order.expiresAt),
    createdAt: toIso(order.createdAt)!,
    paidAt: toIso(order.paidAt),
    deliveredAt: toIso(order.deliveredAt),
  };

  // The payment screen polls this endpoint; nothing here may be cached.
  c.header("cache-control", "no-store");
  return c.json(response);
});
