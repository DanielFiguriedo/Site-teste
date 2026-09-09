import type { Env } from "../env";
import type { PaymentProvider } from "./provider";
import { MercadoPagoProvider } from "./mercadopago";
import { MockProvider } from "./mock";

function construir(env: Env, nome: string): PaymentProvider {
  if (nome === "mock") {
    // Subir com o simulado em produção faria a loja aceitar "pagamentos" que
    // nunca existiram, então isto é recusado mesmo que a configuração peça.
    if (env.AMBIENTE === "producao") {
      throw new Error("O provedor simulado não pode ser usado em produção.");
    }
    return new MockProvider(env.SESSIONS, env.SESSION_SECRET);
  }

  if (nome === "mercadopago") {
    if (!env.MERCADOPAGO_ACCESS_TOKEN || !env.MERCADOPAGO_WEBHOOK_SECRET) {
      throw new Error(
        "Faltam os segredos do Mercado Pago (MERCADOPAGO_ACCESS_TOKEN e MERCADOPAGO_WEBHOOK_SECRET).",
      );
    }
    return new MercadoPagoProvider(env.MERCADOPAGO_ACCESS_TOKEN, env.MERCADOPAGO_WEBHOOK_SECRET);
  }

  throw new Error(`Provedor de pagamento desconhecido: "${nome}".`);
}

/** Provedor configurado para novas cobranças. */
export function obterProvider(env: Env): PaymentProvider {
  return construir(env, env.PAGAMENTO_PROVIDER);
}

/**
 * Provedor de um pedido já existente, pelo nome gravado nele.
 *
 * Necessário porque a configuração muda com o tempo: ao trocar de `mock` para
 * `mercadopago` no deploy (ou de gateway, mais adiante), os pedidos pendentes
 * continuam com cobranças do provedor antigo. Consultá-las com o provedor novo
 * daria 404 e o pedido nunca seria reconciliado.
 */
export function obterProviderPorNome(env: Env, nome: string): PaymentProvider {
  return construir(env, nome);
}

export type { PaymentProvider };
