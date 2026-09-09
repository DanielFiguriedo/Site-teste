import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { MockProvider } from "../payments/mock";
import { naoEncontrado, requisicaoInvalida, ErroApi } from "../lib/erros";
import type { AppEnv } from "../env";

export const dev = new Hono<AppEnv>();

/**
 * Simula a confirmação de um Pix.
 *
 * Existe porque o sandbox do Mercado Pago não permite pagar um Pix de verdade.
 * Em vez de chamar a lógica interna direto, esta rota monta um webhook assinado
 * e o entrega ao endpoint real — assim o que é testado é o caminho de produção
 * inteiro, incluindo assinatura e idempotência.
 */
dev.post("/dev/simular-pagamento", async (c) => {
  if (c.env.AMBIENTE === "producao" || c.env.PAGAMENTO_PROVIDER !== "mock") {
    // Uma rota que marca pedidos como pagos não pode existir fora do mock.
    throw new ErroApi(403, "Rota disponível apenas em desenvolvimento com o provedor simulado.");
  }

  const corpo = (await c.req.json().catch(() => ({}))) as { publicId?: string };
  if (!corpo.publicId) throw requisicaoInvalida("Informe o publicId do pedido.");

  const [pedido] = await db(c.env)
    .select({ chargeId: schema.pedidos.providerChargeId })
    .from(schema.pedidos)
    .where(eq(schema.pedidos.publicId, corpo.publicId))
    .limit(1);

  if (!pedido?.chargeId) throw naoEncontrado("Pedido");

  const mock = new MockProvider(c.env.SESSIONS, c.env.SESSION_SECRET);
  if (!(await mock.simularPagamento(pedido.chargeId))) {
    throw naoEncontrado("Cobrança simulada (pode ter expirado no KV)");
  }

  const { corpo: corpoWebhook, assinatura } = await mock.montarWebhook(pedido.chargeId);
  const origem = new URL(c.req.url).origin;

  const resposta = await fetch(`${origem}/api/webhook/pix`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mock-signature": assinatura },
    body: corpoWebhook,
  });

  return c.json({ ok: resposta.ok, statusWebhook: resposta.status });
});
