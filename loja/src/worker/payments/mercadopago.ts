import {
  timingSafeEqual,
  hmacSha256Hex,
  type ChargeInput,
  type ChargeState,
  type ChargeStatus,
  type PaymentProvider,
  type PixCharge,
  type WebhookEvent,
} from "./provider";
import { centsToReais } from "@shared/money";

const BASE = "https://api.mercadopago.com";

/** Maximum accepted skew between the signature `ts` and the current clock. */
const TOLERANCE_SECONDS = 300;

/** Mercado Pago's vocabulary translated to the store's normalised status. */
function translateStatus(status: string): ChargeStatus {
  switch (status) {
    case "approved":
      return "paid";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "cancelled":
      return "expired";
    case "rejected":
      return "cancelled";
    default:
      // pending, in_process, authorized: not money in the account yet.
      return "pending";
  }
}

interface PaymentResponse {
  id: number;
  status: string;
  transaction_amount?: number;
  transaction_details?: { total_paid_amount?: number };
  date_of_expiration?: string;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string };
  };
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago";

  constructor(
    private readonly accessToken: string,
    private readonly webhookSecret: string,
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // The gateway's error body can carry payer data; log only enough to debug.
      throw new Error(`Mercado Pago responded ${response.status}: ${body.slice(0, 300)}`);
    }
    return response.json() as Promise<T>;
  }

  async createPixCharge(input: ChargeInput): Promise<PixCharge> {
    const expiresAt = new Date(Date.now() + input.validityMinutes * 60_000);

    const payment = await this.call<PaymentResponse>("/v1/payments", {
      method: "POST",
      headers: {
        // Prevents a duplicate charge if the request is retried after a timeout.
        "X-Idempotency-Key": input.reference,
      },
      body: JSON.stringify({
        transaction_amount: centsToReais(input.totalCents),
        description: input.description,
        payment_method_id: "pix",
        external_reference: input.reference,
        notification_url: input.webhookUrl,
        date_of_expiration: expiresAt.toISOString(),
        payer: { email: input.payerEmail },
      }),
    });

    const pix = payment.point_of_interaction?.transaction_data;
    if (!pix?.qr_code) {
      throw new Error("Mercado Pago did not return the Pix code for the charge.");
    }

    return {
      chargeId: String(payment.id),
      brCode: pix.qr_code,
      qrBase64: pix.qr_code_base64 ?? null,
      expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : expiresAt,
    };
  }

  async getCharge(chargeId: string): Promise<ChargeState> {
    const payment = await this.call<PaymentResponse>(`/v1/payments/${chargeId}`);
    const status = translateStatus(payment.status);
    const paid = payment.transaction_details?.total_paid_amount ?? payment.transaction_amount ?? null;

    return {
      status,
      paidCents: status === "paid" && paid !== null ? Math.round(paid * 100) : null,
    };
  }

  /**
   * Mercado Pago signature.
   *
   * Header `x-signature: ts=<epoch>,v1=<hex>`. The manifest is
   * `id:<lowercase data.id>;request-id:<x-request-id>;ts:<ts>;`, with missing
   * parts omitted along with their `;`. The secret is the one from the webhooks
   * panel, which is NOT the access token.
   */
  async verifyWebhookSignature(rawBody: string, headers: Headers): Promise<boolean> {
    const signature = headers.get("x-signature");
    if (!signature || !this.webhookSecret) return false;

    const parts = new Map(
      signature.split(",").map((part) => {
        const [key, ...rest] = part.split("=");
        return [key.trim(), rest.join("=").trim()];
      }),
    );
    const ts = parts.get("ts");
    const v1 = parts.get("v1");
    if (!ts || !v1) return false;

    // A captured request must not be valid forever. Idempotency already blocks
    // a double credit, but closing the window costs three lines.
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

    let dataId: string | undefined;
    try {
      const body = JSON.parse(rawBody) as { data?: { id?: string | number } };
      if (body.data?.id != null) dataId = String(body.data.id).toLowerCase();
    } catch {
      return false;
    }

    const requestId = headers.get("x-request-id");
    const manifest =
      (dataId ? `id:${dataId};` : "") + (requestId ? `request-id:${requestId};` : "") + `ts:${ts};`;

    return timingSafeEqual(await hmacSha256Hex(this.webhookSecret, manifest), v1);
  }

  parseEvent(rawBody: string, headers: Headers): WebhookEvent | null {
    let body: {
      id?: string | number;
      type?: string;
      action?: string;
      data?: { id?: string | number };
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const chargeId = body.data?.id;
    if (body.type !== "payment" || chargeId == null) return null;

    return {
      // `id` is the event id; `x-request-id` is the fallback because a resend
      // of the same event repeats both.
      eventId: String(body.id ?? headers.get("x-request-id") ?? `${chargeId}-${body.action}`),
      chargeId: String(chargeId),
      type: body.action ?? body.type,
    };
  }
}
