import { Hono } from "hono";
import { z } from "zod";
import { criarPedido } from "../lib/pedidos";
import { requisicaoInvalida } from "../lib/erros";
import { verificarTurnstile } from "../lib/turnstile";
import type { AppEnv } from "../env";

export const checkout = new Hono<AppEnv>();

/**
 * Note o que este schema NÃO aceita: preço, total ou desconto. O cliente diz
 * apenas o que quer comprar; quanto custa é decidido no servidor.
 */
const schemaCheckout = z.object({
  produtoSlug: z.string().min(1).max(120),
  quantidade: z.number().int().min(1).max(10).default(1),
  /** Só usado em produto de valor livre; validado contra o mínimo do banco. */
  valorCentavos: z.number().int().positive().max(500_000).optional(),
  nick: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z0-9_ .]+$/, "O nick contém caracteres inválidos."),
  plataforma: z.enum(["java", "bedrock"]).default("java"),
  // Obrigatório: o Mercado Pago exige um e-mail de pagador, e é por ele que o
  // comprador recebe o recibo e é encontrado se algo der errado na entrega.
  email: z.string().trim().email().max(160),
  nickPresenteado: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z0-9_ .]+$/)
    .optional(),
  turnstileToken: z.string().optional(),
});

checkout.post("/checkout", async (c) => {
  const bruto = await c.req.json().catch(() => null);
  const analise = schemaCheckout.safeParse(bruto);

  if (!analise.success) {
    throw requisicaoInvalida("Dados do pedido inválidos.", analise.error.issues);
  }
  const entrada = analise.data;

  await verificarTurnstile(c.env, entrada.turnstileToken, c.req.header("cf-connecting-ip"));

  const origem = new URL(c.req.url).origin;
  const resultado = await criarPedido(
    c.env,
    entrada,
    origem,
    c.req.header("cf-connecting-ip") ?? null,
  );

  return c.json(resultado, 201);
});
