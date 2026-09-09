import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { getProvider, getProviderByName } from "../payments";
import { badRequest, notFound, ApiError } from "./errors";
import type { Env } from "../env";
import type { OrderStatus, Platform } from "@shared/types";

/** QR Code validity. Short enough not to hold stock hostage. */
const VALIDITY_MINUTES = 30;
/** Minimum amount for a pay-what-you-want product, in cents. */
const MIN_PAY_WHAT_YOU_WANT = 100;
/** Per-order cap, a brake against typos and abuse. */
const MAX_QUANTITY = 10;
/**
 * How many orders the cron re-checks per run.
 *
 * Workers caps subrequests per invocation (50 on the free plan) and each order
 * costs one call to the gateway. Asking for more than fits makes the whole
 * batch fail midway, run after run.
 */
const PER_CRON_RUN = 20;
/** Unpaid orders a single IP may hold open at once. */
const OPEN_ORDERS_PER_IP = 8;

/**
 * Allowed order transitions.
 *
 * Written as data rather than scattered `if`s so that a double delivery, or an
 * expired order "returning" to paid, is impossible by construction.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["paid", "expired", "cancelled", "needs_review"],
  // An order under review was paid in a way that does not match expectations
  // (wrong amount, unknown amount, paid after expiry). Only a human decides.
  needs_review: ["paid", "cancelled", "refunded"],
  paid: ["delivered", "refunded", "cancelled"],
  delivered: ["refunded"],
  expired: ["needs_review"],
  cancelled: [],
  refunded: [],
};

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface CheckoutInput {
  productSlug: string;
  quantity: number;
  /** Pay-what-you-want products only; ignored otherwise. */
  amountCents?: number;
  nick: string;
  platform: Platform;
  email: string;
  recipientNick?: string;
}

/**
 * Creates the order and its Pix charge.
 *
 * The price NEVER comes from the client: the input carries only a product slug
 * and a quantity, and the total is recomputed from what is stored in D1.
 */
export async function createOrder(
  env: Env,
  input: CheckoutInput,
  origin: string,
  ip: string | null,
) {
  const database = db(env);

  // Abuse brake independent of Turnstile: without it a script would flood the
  // pending queue and drown the cron reconciliation.
  if (ip) {
    const [{ open }] = await database
      .select({ open: sql<number>`count(*)` })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.ip, ip),
          eq(schema.orders.status, "awaiting_payment"),
          sql`${schema.orders.createdAt} > unixepoch() - 3600`,
        ),
      );

    if (open >= OPEN_ORDERS_PER_IP) {
      throw new ApiError(
        429,
        "Você tem pedidos demais aguardando pagamento. Pague ou aguarde eles expirarem.",
      );
    }
  }

  const [product] = await database
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.slug, input.productSlug), eq(schema.products.active, true)))
    .limit(1);

  if (!product) throw notFound("Produto");

  const quantity = product.payWhatYouWant
    ? 1
    : Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(input.quantity)));

  if (product.stock !== null && product.stock < quantity) {
    throw badRequest("Não há estoque suficiente para este produto.");
  }

  if (!product.giftable && input.recipientNick) {
    throw badRequest("Este produto não pode ser presenteado.");
  }

  // Unit price: the one from the database, or the buyer's chosen amount on a
  // pay-what-you-want product — bounded by the minimum, also from the database.
  let unitPrice: number;
  if (product.payWhatYouWant) {
    const chosen = Math.trunc(input.amountCents ?? 0);
    const minimum = Math.max(MIN_PAY_WHAT_YOU_WANT, product.priceCents);
    if (chosen < minimum) {
      throw badRequest(`O valor mínimo para este produto é de ${minimum} centavos.`);
    }
    unitPrice = chosen;
  } else {
    unitPrice = product.priceCents;
  }

  const totalCents = unitPrice * quantity;
  const publicId = crypto.randomUUID().replace(/-/g, "");

  const provider = getProvider(env);
  const charge = await provider.createPixCharge({
    reference: publicId,
    totalCents,
    description: `${product.name} - pedido ${publicId.slice(0, 8)}`,
    payerEmail: input.email,
    webhookUrl: `${origin}/api/webhook/pix`,
    validityMinutes: VALIDITY_MINUTES,
  });

  const [order] = await database
    .insert(schema.orders)
    .values({
      publicId,
      nick: input.nick,
      platform: input.platform,
      email: input.email,
      recipientNick: input.recipientNick ?? null,
      totalCents,
      status: "awaiting_payment",
      provider: provider.name,
      providerChargeId: charge.chargeId,
      pixBrCode: charge.brCode,
      pixQrBase64: charge.qrBase64,
      expiresAt: Math.floor(charge.expiresAt.getTime() / 1000),
      ip,
    })
    .returning({ id: schema.orders.id });

  // Immutable snapshot: changing the product's price tomorrow must not rewrite
  // what was sold today.
  await database.insert(schema.orderItems).values({
    orderId: order.id,
    productId: product.id,
    name: product.name,
    priceCents: unitPrice,
    quantity,
    imageKey: product.imageKey,
  });

  return { publicId, totalCents };
}

export type PaymentOutcome = "paid" | "already_processed" | "needs_review" | "unknown";

/** Flags the order for human review without crediting anything. */
async function flagForReview(env: Env, orderId: number, from: OrderStatus, reason: string) {
  await db(env)
    .update(schema.orders)
    .set({ status: "needs_review", adminNote: reason })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, from)));
}

/**
 * Marks an order as paid.
 *
 * Idempotent and defensive. Anything other than "the exact order total, on an
 * order still awaiting payment" goes to manual review instead of crediting —
 * including a payment that lands after the order expired, which used to vanish
 * silently.
 */
export async function markAsPaid(
  env: Env,
  chargeId: string,
  paidCents: number | null,
): Promise<PaymentOutcome> {
  const database = db(env);

  const [order] = await database
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.providerChargeId, chargeId))
    .limit(1);

  if (!order) return "unknown";

  // Payment confirmed on an order already written off: it cannot be ignored,
  // because the money really did arrive.
  if (order.status === "expired") {
    await flagForReview(
      env,
      order.id,
      "expired",
      "Pagamento confirmado depois de o pedido expirar. Conferir no gateway antes de entregar.",
    );
    return "needs_review";
  }

  if (order.status !== "awaiting_payment") {
    // Already paid, delivered, cancelled or under review: nothing to do. Not an
    // error — the gateway resends the same event several times.
    return "already_processed";
  }

  if (paidCents === null) {
    // An unknown amount is not the same as a checked amount.
    await flagForReview(
      env,
      order.id,
      "awaiting_payment",
      "O gateway confirmou o pagamento mas não informou o valor. Conferir antes de entregar.",
    );
    return "needs_review";
  }

  if (paidCents !== order.totalCents) {
    await flagForReview(
      env,
      order.id,
      "awaiting_payment",
      `Valor pago (${paidCents} centavos) diferente do total do pedido ` +
        `(${order.totalCents} centavos). Conferir antes de entregar.`,
    );
    return "needs_review";
  }

  // The status guard in the WHERE closes the race between webhook and cron: if
  // both arrive together, only one UPDATE finds the row still awaiting payment.
  const updated = await database
    .update(schema.orders)
    .set({ status: "paid", paidAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "awaiting_payment")))
    .returning({ id: schema.orders.id });

  if (updated.length === 0) return "already_processed";

  await decrementStock(env, order.id);
  return "paid";
}

/**
 * Decrements stock for the order's items, after the payment is confirmed.
 *
 * If stock does not cover the quantity, the order is annotated rather than the
 * shortfall being silently clamped to zero: without that note the owner would
 * get a queued order for an item they do not have, and only find out while
 * trying to deliver it.
 */
async function decrementStock(env: Env, orderId: number) {
  const database = db(env);
  const items = await database
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, orderId));

  const oversold: string[] = [];

  for (const item of items) {
    const [product] = await database
      .select({ stock: schema.products.stock })
      .from(schema.products)
      .where(eq(schema.products.id, item.productId))
      .limit(1);

    if (!product || product.stock === null) continue;

    if (product.stock < item.quantity) oversold.push(item.name);

    await database
      .update(schema.products)
      .set({ stock: sql`MAX(0, ${schema.products.stock} - ${item.quantity})` })
      .where(eq(schema.products.id, item.productId));
  }

  if (oversold.length > 0) {
    await database
      .update(schema.orders)
      .set({ adminNote: `Estoque insuficiente no momento do pagamento: ${oversold.join(", ")}.` })
      .where(eq(schema.orders.id, orderId));
  }
}

/** Changes an order's status, validating the transition. Used by the admin panel. */
export async function changeStatus(
  env: Env,
  publicId: string,
  next: OrderStatus,
  author: string,
  note?: string,
) {
  const database = db(env);
  const [order] = await database
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.publicId, publicId))
    .limit(1);

  if (!order) throw notFound("Pedido");

  if (!isValidTransition(order.status, next)) {
    throw new ApiError(409, `Não é possível mudar o pedido de "${order.status}" para "${next}".`);
  }

  const now = Math.floor(Date.now() / 1000);
  const updated = await database
    .update(schema.orders)
    .set({
      status: next,
      ...(note !== undefined ? { adminNote: note } : {}),
      ...(next === "delivered" ? { deliveredAt: now, deliveredBy: author } : {}),
    })
    // The status guard in the WHERE is what stops two admins from delivering
    // the same order: the second UPDATE no longer finds the row.
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, order.status)))
    .returning({ id: schema.orders.id });

  if (updated.length === 0) {
    throw new ApiError(409, "Este pedido acabou de ser alterado por outra pessoa. Atualize a página.");
  }
}

/**
 * Safety net executed by the cron.
 *
 * Re-queries orders still awaiting payment and expires **only** those the
 * gateway confirmed as unpaid. An order is expired blindly only when there is
 * no charge to query — expiring without asking would turn a gateway outage into
 * customers who paid and got nothing.
 */
export async function reconcileOrders(env: Env) {
  const database = db(env);
  const now = Math.floor(Date.now() / 1000);

  const pending = await database
    .select({
      publicId: schema.orders.publicId,
      chargeId: schema.orders.providerChargeId,
      provider: schema.orders.provider,
      expiresAt: schema.orders.expiresAt,
    })
    .from(schema.orders)
    .where(eq(schema.orders.status, "awaiting_payment"))
    // Ordered by expiry, not by creation. Without ordering, D1 returns roughly
    // the same rows every run and the tail is never queried; ordering by
    // creation would make a freshly expired order wait behind a queue of still
    // valid ones. Whoever is closest to expiring needs a decision now — and,
    // once resolved, frees the slot.
    .orderBy(asc(schema.orders.expiresAt))
    .limit(PER_CRON_RUN);

  const toExpire: string[] = [];

  for (const order of pending) {
    if (!order.chargeId) continue;
    try {
      // The provider comes from the order, not from the current configuration:
      // swapping gateways must not orphan the older orders.
      const provider = getProviderByName(env, order.provider);
      const state = await provider.getCharge(order.chargeId);

      if (state.status === "paid") {
        await markAsPaid(env, order.chargeId, state.paidCents);
      } else if (order.expiresAt !== null && order.expiresAt < now) {
        // Expires only because the gateway confirmed it was not paid.
        toExpire.push(order.publicId);
      }
    } catch (e) {
      // One charge failing to load must not take down the reconciliation of the
      // others — and, by not entering `toExpire`, it stays pending for the next
      // run instead of becoming a lost order.
      console.error(`Failed to reconcile ${order.publicId}:`, e);
    }
  }

  if (toExpire.length > 0) {
    await database
      .update(schema.orders)
      .set({ status: "expired" })
      .where(
        and(
          inArray(schema.orders.publicId, toExpire),
          eq(schema.orders.status, "awaiting_payment"),
        ),
      );
  }

  // Orders with no charge at the gateway have nothing to query: expiring those
  // blindly is safe, because no Pix was ever generated for them.
  await database
    .update(schema.orders)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.orders.status, "awaiting_payment"),
        isNull(schema.orders.providerChargeId),
        lt(schema.orders.expiresAt, now),
      ),
    );
}
