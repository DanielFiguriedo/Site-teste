import { Hono } from "hono";
import { z } from "zod";
import { createOrder } from "../lib/orders";
import { badRequest } from "../lib/errors";
import { verifyTurnstile } from "../lib/turnstile";
import type { AppEnv } from "../env";

export const checkout = new Hono<AppEnv>();

/**
 * Note what this schema does NOT accept: price, total or discount. The client
 * only says what it wants to buy; how much it costs is decided on the server.
 */
const checkoutSchema = z.object({
  productSlug: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(10).default(1),
  /** Pay-what-you-want only; validated against the minimum from the database. */
  amountCents: z.number().int().positive().max(500_000).optional(),
  nick: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z0-9_ .]+$/, "O nick contém caracteres inválidos."),
  platform: z.enum(["java", "bedrock"]).default("java"),
  // Required: Mercado Pago demands a payer e-mail, and it is how the buyer gets
  // the receipt and can be reached if delivery goes wrong.
  email: z.string().trim().email().max(160),
  recipientNick: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z0-9_ .]+$/)
    .optional(),
  turnstileToken: z.string().optional(),
});

checkout.post("/checkout", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(raw);

  if (!parsed.success) {
    throw badRequest("Dados do pedido inválidos.", parsed.error.issues);
  }
  const input = parsed.data;

  await verifyTurnstile(c.env, input.turnstileToken, c.req.header("cf-connecting-ip"));

  const origin = new URL(c.req.url).origin;
  const result = await createOrder(c.env, input, origin, c.req.header("cf-connecting-ip") ?? null);

  return c.json(result, 201);
});
