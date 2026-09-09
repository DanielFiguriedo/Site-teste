import type { Env } from "../env";
import type { PaymentProvider } from "./provider";
import { MercadoPagoProvider } from "./mercadopago";
import { MockProvider } from "./mock";

function build(env: Env, name: string): PaymentProvider {
  if (name === "mock") {
    // Shipping with the simulated provider by mistake would make the store
    // accept "payments" that never happened, so this is refused outright.
    if (env.ENVIRONMENT === "production") {
      throw new Error("The simulated provider cannot be used in production.");
    }
    return new MockProvider(env.SESSIONS, env.SESSION_SECRET);
  }

  if (name === "mercadopago") {
    if (!env.MERCADOPAGO_ACCESS_TOKEN || !env.MERCADOPAGO_WEBHOOK_SECRET) {
      throw new Error(
        "Missing Mercado Pago secrets (MERCADOPAGO_ACCESS_TOKEN and MERCADOPAGO_WEBHOOK_SECRET).",
      );
    }
    return new MercadoPagoProvider(env.MERCADOPAGO_ACCESS_TOKEN, env.MERCADOPAGO_WEBHOOK_SECRET);
  }

  throw new Error(`Unknown payment provider: "${name}".`);
}

/** Provider configured for new charges. */
export function getProvider(env: Env): PaymentProvider {
  return build(env, env.PAYMENT_PROVIDER);
}

/**
 * Provider of an existing order, by the name stored on it.
 *
 * Needed because configuration changes over time: switching from `mock` to
 * `mercadopago` on deploy (or swapping gateways later) leaves pending orders
 * holding charges that only exist at the previous provider. Querying those with
 * the new provider would 404 and the order would never reconcile.
 */
export function getProviderByName(env: Env, name: string): PaymentProvider {
  return build(env, name);
}

export type { PaymentProvider };
