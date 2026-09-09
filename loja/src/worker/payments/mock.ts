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

/**
 * Simulated provider, used in development and tests only.
 *
 * It exists for a concrete reason: Mercado Pago's sandbox **cannot actually pay
 * a Pix charge**. Without this mock there would be no way to exercise the full
 * flow (charge → QR → webhook → delivery queue) before going live.
 *
 * Charge state lives in KV; the development route `/api/dev/simulate-payment`
 * marks a charge as paid and fires the same webhook path the real gateway uses.
 */
export class MockProvider implements PaymentProvider {
  readonly name = "mock";

  constructor(
    private readonly kv: KVNamespace,
    private readonly secret: string,
  ) {}

  private key(chargeId: string) {
    return `mock:charge:${chargeId}`;
  }

  async createPixCharge(input: ChargeInput): Promise<PixCharge> {
    const chargeId = `mock_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + input.validityMinutes * 60_000);

    await this.kv.put(
      this.key(chargeId),
      JSON.stringify({
        status: "pending" satisfies ChargeStatus,
        totalCents: input.totalCents,
        reference: input.reference,
      }),
      // Outlives the charge so the cron can still query it after expiry.
      { expirationTtl: Math.max(60, input.validityMinutes * 60 * 2) },
    );

    return {
      chargeId,
      // Shaped like a BR Code purely so the screen looks realistic. It is not a
      // valid Pix payload — and must not be: this never runs in production.
      brCode:
        `00020126580014BR.GOV.BCB.PIX0136${chargeId}520400005303986540` +
        `${(input.totalCents / 100).toFixed(2)}5802BR5913LOJA SIMULADA6009SAO PAULO62070503***6304MOCK`,
      qrBase64: null,
      expiresAt,
    };
  }

  async getCharge(chargeId: string): Promise<ChargeState> {
    const raw = await this.kv.get(this.key(chargeId));
    if (!raw) return { status: "expired", paidCents: null };

    const data = JSON.parse(raw) as { status: ChargeStatus; totalCents: number };
    return {
      status: data.status,
      paidCents: data.status === "paid" ? data.totalCents : null,
    };
  }

  /**
   * Marks the charge as paid. Only the development route calls this.
   *
   * `paidCents` overrides the amount, which is how tests reproduce an underpaid
   * charge without touching the gateway.
   */
  async simulatePayment(chargeId: string, paidCents?: number): Promise<boolean> {
    const raw = await this.kv.get(this.key(chargeId));
    if (!raw) return false;

    const data = JSON.parse(raw) as Record<string, unknown>;
    await this.kv.put(
      this.key(chargeId),
      JSON.stringify({
        ...data,
        status: "paid",
        ...(paidCents !== undefined ? { totalCents: paidCents } : {}),
      }),
      { expirationTtl: 3600 },
    );
    return true;
  }

  /** Builds the body and header the simulated webhook will carry. */
  async buildWebhook(chargeId: string): Promise<{ body: string; signature: string }> {
    const body = JSON.stringify({
      id: `evt_${crypto.randomUUID()}`,
      type: "payment",
      action: "payment.updated",
      data: { id: chargeId },
    });
    return { body, signature: await hmacSha256Hex(this.secret, body) };
  }

  async verifyWebhookSignature(rawBody: string, headers: Headers): Promise<boolean> {
    const sent = headers.get("x-mock-signature");
    if (!sent) return false;
    return timingSafeEqual(await hmacSha256Hex(this.secret, rawBody), sent);
  }

  parseEvent(rawBody: string): WebhookEvent | null {
    try {
      const body = JSON.parse(rawBody) as {
        id?: string;
        type?: string;
        action?: string;
        data?: { id?: string };
      };
      if (body.type !== "payment" || !body.data?.id || !body.id) return null;
      return { eventId: body.id, chargeId: body.data.id, type: body.action ?? "payment" };
    } catch {
      return null;
    }
  }
}
