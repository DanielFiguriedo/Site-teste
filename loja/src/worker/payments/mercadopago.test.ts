import { describe, expect, it } from "vitest";
import { MercadoPagoProvider } from "./mercadopago";
import { comparaSegura, hmacSha256Hex } from "./provider";

const SEGREDO = "segredo-do-webhook-do-painel";
const provider = new MercadoPagoProvider("token-qualquer", SEGREDO);

/**
 * Monta um webhook válido do jeito que o Mercado Pago monta.
 *
 * O `ts` é gerado agora de propósito: a verificação recusa assinaturas velhas,
 * então um timestamp fixo no código passaria a falhar com o tempo.
 */
async function webhookAssinado(chargeId: string, requestId = "req-123", segundosAtras = 0) {
  const corpo = JSON.stringify({
    id: 987654,
    type: "payment",
    action: "payment.updated",
    data: { id: chargeId },
  });
  const ts = String(Math.floor(Date.now() / 1000) - segundosAtras);
  const manifesto = `id:${chargeId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = await hmacSha256Hex(SEGREDO, manifesto);

  return {
    corpo,
    cabecalhos: new Headers({
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": requestId,
    }),
  };
}

describe("verificarAssinaturaWebhook", () => {
  it("aceita uma assinatura legítima", async () => {
    const { corpo, cabecalhos } = await webhookAssinado("112233");
    expect(await provider.verificarAssinaturaWebhook(corpo, cabecalhos)).toBe(true);
  });

  it("recusa quando o segredo é outro", async () => {
    const outro = new MercadoPagoProvider("token", "segredo-errado");
    const { corpo, cabecalhos } = await webhookAssinado("112233");
    expect(await outro.verificarAssinaturaWebhook(corpo, cabecalhos)).toBe(false);
  });

  it("recusa quando o corpo é adulterado depois de assinado", async () => {
    const { cabecalhos } = await webhookAssinado("112233");
    // O atacante troca a cobrança referenciada, mantendo a assinatura original.
    const adulterado = JSON.stringify({
      id: 987654,
      type: "payment",
      action: "payment.updated",
      data: { id: "999999" },
    });
    expect(await provider.verificarAssinaturaWebhook(adulterado, cabecalhos)).toBe(false);
  });

  it("recusa quando o x-request-id não bate", async () => {
    const { corpo, cabecalhos } = await webhookAssinado("112233", "req-123");
    cabecalhos.set("x-request-id", "req-outro");
    expect(await provider.verificarAssinaturaWebhook(corpo, cabecalhos)).toBe(false);
  });

  it("recusa quando não há cabeçalho de assinatura", async () => {
    const { corpo } = await webhookAssinado("112233");
    expect(await provider.verificarAssinaturaWebhook(corpo, new Headers())).toBe(false);
  });

  it("recusa corpo que não é JSON", async () => {
    const { cabecalhos } = await webhookAssinado("112233");
    expect(await provider.verificarAssinaturaWebhook("<html>erro</html>", cabecalhos)).toBe(false);
  });

  it("recusa uma assinatura antiga, mesmo sendo legítima", async () => {
    // Fecha a janela de reenvio de uma requisição capturada.
    const { corpo, cabecalhos } = await webhookAssinado("112233", "req-123", 3600);
    expect(await provider.verificarAssinaturaWebhook(corpo, cabecalhos)).toBe(false);
  });

  it("aceita uma assinatura dentro da tolerância", async () => {
    const { corpo, cabecalhos } = await webhookAssinado("112233", "req-123", 60);
    expect(await provider.verificarAssinaturaWebhook(corpo, cabecalhos)).toBe(true);
  });
});

describe("extrairEvento", () => {
  it("extrai o id do evento e o da cobrança", async () => {
    const { corpo, cabecalhos } = await webhookAssinado("112233");
    expect(provider.extrairEvento(corpo, cabecalhos)).toEqual({
      eventoId: "987654",
      chargeId: "112233",
      tipo: "payment.updated",
    });
  });

  it("ignora evento que não é de pagamento", () => {
    const corpo = JSON.stringify({ id: 1, type: "plan", data: { id: "x" } });
    expect(provider.extrairEvento(corpo, new Headers())).toBeNull();
  });
});

describe("comparaSegura", () => {
  it("compara conteúdo, não referência", () => {
    expect(comparaSegura("abc", "abc")).toBe(true);
    expect(comparaSegura("abc", "abd")).toBe(false);
    expect(comparaSegura("abc", "abcd")).toBe(false);
    expect(comparaSegura("", "")).toBe(true);
  });
});
