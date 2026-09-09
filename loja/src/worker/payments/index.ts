import type { Env } from "../env";
import type { PaymentProvider } from "./provider";
import { MercadoPagoProvider } from "./mercadopago";
import { MockProvider } from "./mock";

/**
 * Escolhe o provedor a partir da configuração.
 *
 * O mock é recusado em produção de propósito: subir com `PAGAMENTO_PROVIDER=mock`
 * por engano faria a loja aceitar "pagamentos" que nunca existiram.
 */
export function obterProvider(env: Env): PaymentProvider {
  if (env.PAGAMENTO_PROVIDER === "mock") {
    if (env.AMBIENTE === "producao") {
      throw new Error("O provedor simulado não pode ser usado em produção.");
    }
    return new MockProvider(env.SESSIONS, env.SESSION_SECRET);
  }

  if (!env.MERCADOPAGO_ACCESS_TOKEN || !env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new Error(
      "Faltam os segredos do Mercado Pago (MERCADOPAGO_ACCESS_TOKEN e MERCADOPAGO_WEBHOOK_SECRET).",
    );
  }
  return new MercadoPagoProvider(env.MERCADOPAGO_ACCESS_TOKEN, env.MERCADOPAGO_WEBHOOK_SECRET);
}

export type { PaymentProvider };
