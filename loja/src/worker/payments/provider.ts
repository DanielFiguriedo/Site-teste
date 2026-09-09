/**
 * Payment provider contract.
 *
 * It exists so that swapping gateways costs one file rather than a refactor:
 * the store owner's account type (individual CPF or company CNPJ) is still
 * undecided, and that can change which gateway accepts the signup.
 */

/** Normalised status — every gateway has its own vocabulary; ours is this one. */
export type ChargeStatus = "pending" | "paid" | "expired" | "cancelled" | "refunded";

export interface PixCharge {
  /** Charge identifier at the gateway. */
  chargeId: string;
  /** The BR Code — Pix "copy and paste" payload. */
  brCode: string;
  /** QR Code PNG in base64, without the `data:` prefix. Null if not provided. */
  qrBase64: string | null;
  /** Moment the charge stops being payable. */
  expiresAt: Date;
}

export interface ChargeInput {
  /** The order's `publicId` — becomes the external reference at the gateway. */
  reference: string;
  totalCents: number;
  description: string;
  payerEmail: string;
  /** Absolute URL the gateway calls when the payment changes state. */
  webhookUrl: string;
  /** How many minutes the QR Code stays valid. */
  validityMinutes: number;
}

export interface ChargeState {
  status: ChargeStatus;
  /** Amount actually paid, in cents. Null while there is no payment. */
  paidCents: number | null;
}

export interface WebhookEvent {
  /** Event id at the gateway. This is the idempotency key. */
  eventId: string;
  /** Id of the charge the event refers to. */
  chargeId: string;
  type: string;
}

export interface PaymentProvider {
  readonly name: string;

  createPixCharge(input: ChargeInput): Promise<PixCharge>;

  getCharge(chargeId: string): Promise<ChargeState>;

  /**
   * Validates the webhook signature against the RAW request body.
   * Never pass re-serialised JSON here: the signature covers the original
   * bytes, and any reserialisation invalidates it.
   */
  verifyWebhookSignature(rawBody: string, headers: Headers): Promise<boolean>;

  /** Extracts what matters from the payload. Returns null for irrelevant events. */
  parseEvent(rawBody: string, headers: Headers): WebhookEvent | null;
}

/** Constant-time string comparison, so the signature does not leak via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/** HMAC-SHA256 as hex, through WebCrypto (`node:crypto` does not exist here). */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
