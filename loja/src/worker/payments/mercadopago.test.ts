import { describe, expect, it } from "vitest";
import { MercadoPagoProvider } from "./mercadopago";
import { timingSafeEqual, hmacSha256Hex } from "./provider";

const SECRET = "webhook-secret-from-the-panel";
const provider = new MercadoPagoProvider("any-token", SECRET);

/**
 * Builds a valid webhook the way Mercado Pago builds it.
 *
 * The `ts` is generated now on purpose: verification rejects stale signatures,
 * so a timestamp hard-coded in the file would start failing over time.
 */
async function signedWebhook(chargeId: string, requestId = "req-123", secondsAgo = 0) {
  const body = JSON.stringify({
    id: 987654,
    type: "payment",
    action: "payment.updated",
    data: { id: chargeId },
  });
  const ts = String(Math.floor(Date.now() / 1000) - secondsAgo);
  const manifest = `id:${chargeId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = await hmacSha256Hex(SECRET, manifest);

  return {
    body,
    headers: new Headers({
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": requestId,
    }),
  };
}

describe("verifyWebhookSignature", () => {
  it("accepts a legitimate signature", async () => {
    const { body, headers } = await signedWebhook("112233");
    expect(await provider.verifyWebhookSignature(body, headers)).toBe(true);
  });

  it("rejects a signature made with a different secret", async () => {
    const other = new MercadoPagoProvider("token", "wrong-secret");
    const { body, headers } = await signedWebhook("112233");
    expect(await other.verifyWebhookSignature(body, headers)).toBe(false);
  });

  it("rejects a body tampered with after signing", async () => {
    const { headers } = await signedWebhook("112233");
    // The attacker swaps the referenced charge, keeping the original signature.
    const tampered = JSON.stringify({
      id: 987654,
      type: "payment",
      action: "payment.updated",
      data: { id: "999999" },
    });
    expect(await provider.verifyWebhookSignature(tampered, headers)).toBe(false);
  });

  it("rejects a mismatched x-request-id", async () => {
    const { body, headers } = await signedWebhook("112233", "req-123");
    headers.set("x-request-id", "req-other");
    expect(await provider.verifyWebhookSignature(body, headers)).toBe(false);
  });

  it("rejects a request with no signature header", async () => {
    const { body } = await signedWebhook("112233");
    expect(await provider.verifyWebhookSignature(body, new Headers())).toBe(false);
  });

  it("rejects a malformed signature header", async () => {
    const { body } = await signedWebhook("112233");
    const headers = new Headers({ "x-signature": "not-a-signature", "x-request-id": "req-123" });
    expect(await provider.verifyWebhookSignature(body, headers)).toBe(false);
  });

  it("rejects a body that is not JSON", async () => {
    const { headers } = await signedWebhook("112233");
    expect(await provider.verifyWebhookSignature("<html>error</html>", headers)).toBe(false);
  });

  it("rejects an old signature, even a legitimate one", async () => {
    // Closes the replay window on a captured request.
    const { body, headers } = await signedWebhook("112233", "req-123", 3600);
    expect(await provider.verifyWebhookSignature(body, headers)).toBe(false);
  });

  it("accepts a signature within the tolerance window", async () => {
    const { body, headers } = await signedWebhook("112233", "req-123", 60);
    expect(await provider.verifyWebhookSignature(body, headers)).toBe(true);
  });
});

describe("parseEvent", () => {
  it("extracts the event id and the charge id", async () => {
    const { body, headers } = await signedWebhook("112233");
    expect(provider.parseEvent(body, headers)).toEqual({
      eventId: "987654",
      chargeId: "112233",
      type: "payment.updated",
    });
  });

  it("falls back to x-request-id when the payload has no event id", () => {
    const body = JSON.stringify({ type: "payment", action: "payment.updated", data: { id: "77" } });
    const headers = new Headers({ "x-request-id": "req-abc" });
    expect(provider.parseEvent(body, headers)?.eventId).toBe("req-abc");
  });

  it("ignores events that are not payments", () => {
    const body = JSON.stringify({ id: 1, type: "plan", data: { id: "x" } });
    expect(provider.parseEvent(body, new Headers())).toBeNull();
  });

  it("ignores a payload with no charge id", () => {
    const body = JSON.stringify({ id: 1, type: "payment", data: {} });
    expect(provider.parseEvent(body, new Headers())).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("compares content, not reference", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
