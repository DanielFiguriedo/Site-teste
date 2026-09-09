import {
  comparaSegura,
  hmacSha256Hex,
  type CobrancaPix,
  type DadosCobranca,
  type EventoWebhook,
  type PaymentProvider,
  type SituacaoCobranca,
  type StatusCobranca,
} from "./provider";
import { centavosParaReais } from "@shared/dinheiro";

const BASE = "https://api.mercadopago.com";

/** Diferença máxima aceita entre o `ts` da assinatura e o relógio atual. */
const TOLERANCIA_SEGUNDOS = 300;

/** Vocabulário do Mercado Pago traduzido para o status normalizado da loja. */
function traduzirStatus(status: string): StatusCobranca {
  switch (status) {
    case "approved":
      return "pago";
    case "refunded":
    case "charged_back":
      return "reembolsado";
    case "cancelled":
      return "expirado";
    case "rejected":
      return "cancelado";
    default:
      // pending, in_process, authorized: ainda não é dinheiro na conta.
      return "pendente";
  }
}

interface RespostaPagamento {
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
  readonly nome = "mercadopago";

  constructor(
    private readonly accessToken: string,
    private readonly segredoWebhook: string,
  ) {}

  private async chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
    const resposta = await fetch(`${BASE}${caminho}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      // O corpo do erro do gateway pode conter dados do pagador; registre só o
      // suficiente para depurar.
      throw new Error(`Mercado Pago respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    }
    return resposta.json() as Promise<T>;
  }

  async criarCobrancaPix(dados: DadosCobranca): Promise<CobrancaPix> {
    const expiraEm = new Date(Date.now() + dados.minutosValidade * 60_000);

    const pagamento = await this.chamar<RespostaPagamento>("/v1/payments", {
      method: "POST",
      headers: {
        // Impede cobrança duplicada se a requisição for repetida por timeout.
        "X-Idempotency-Key": dados.referencia,
      },
      body: JSON.stringify({
        transaction_amount: centavosParaReais(dados.totalCentavos),
        description: dados.descricao,
        payment_method_id: "pix",
        external_reference: dados.referencia,
        notification_url: dados.urlWebhook,
        date_of_expiration: expiraEm.toISOString(),
        payer: { email: dados.emailPagador },
      }),
    });

    const pix = pagamento.point_of_interaction?.transaction_data;
    if (!pix?.qr_code) {
      throw new Error("Mercado Pago não retornou o código Pix da cobrança.");
    }

    return {
      chargeId: String(pagamento.id),
      copiaCola: pix.qr_code,
      qrBase64: pix.qr_code_base64 ?? null,
      expiraEm: pagamento.date_of_expiration ? new Date(pagamento.date_of_expiration) : expiraEm,
    };
  }

  async consultarCobranca(chargeId: string): Promise<SituacaoCobranca> {
    const pagamento = await this.chamar<RespostaPagamento>(`/v1/payments/${chargeId}`);
    const status = traduzirStatus(pagamento.status);
    const pago =
      pagamento.transaction_details?.total_paid_amount ?? pagamento.transaction_amount ?? null;

    return {
      status,
      valorPagoCentavos: status === "pago" && pago !== null ? Math.round(pago * 100) : null,
    };
  }

  /**
   * Assinatura do Mercado Pago.
   *
   * Cabeçalho `x-signature: ts=<epoch>,v1=<hex>`. O manifesto é
   * `id:<data.id minúsculo>;request-id:<x-request-id>;ts:<ts>;`, com as partes
   * ausentes omitidas junto com o seu `;`. O segredo é o do painel de webhooks,
   * que NÃO é o access token.
   */
  async verificarAssinaturaWebhook(corpoCru: string, cabecalhos: Headers): Promise<boolean> {
    const assinatura = cabecalhos.get("x-signature");
    if (!assinatura || !this.segredoWebhook) return false;

    const partes = new Map(
      assinatura.split(",").map((p) => {
        const [chave, ...resto] = p.split("=");
        return [chave.trim(), resto.join("=").trim()];
      }),
    );
    const ts = partes.get("ts");
    const v1 = partes.get("v1");
    if (!ts || !v1) return false;

    // Uma requisição capturada não pode valer para sempre. A idempotência já
    // impede crédito duplicado, mas fechar a janela custa três linhas.
    const idade = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(idade) || idade > TOLERANCIA_SEGUNDOS) return false;

    let dataId: string | undefined;
    try {
      const corpo = JSON.parse(corpoCru) as { data?: { id?: string | number } };
      if (corpo.data?.id != null) dataId = String(corpo.data.id).toLowerCase();
    } catch {
      return false;
    }

    const requestId = cabecalhos.get("x-request-id");
    const manifesto =
      (dataId ? `id:${dataId};` : "") +
      (requestId ? `request-id:${requestId};` : "") +
      `ts:${ts};`;

    return comparaSegura(await hmacSha256Hex(this.segredoWebhook, manifesto), v1);
  }

  extrairEvento(corpoCru: string, cabecalhos: Headers): EventoWebhook | null {
    let corpo: { id?: string | number; type?: string; action?: string; data?: { id?: string | number } };
    try {
      corpo = JSON.parse(corpoCru);
    } catch {
      return null;
    }

    const chargeId = corpo.data?.id;
    if (corpo.type !== "payment" || chargeId == null) return null;

    return {
      // `id` é o id do evento; o `x-request-id` serve de reserva porque um
      // reenvio do mesmo evento repete ambos.
      eventoId: String(corpo.id ?? cabecalhos.get("x-request-id") ?? `${chargeId}-${corpo.action}`),
      chargeId: String(chargeId),
      tipo: corpo.action ?? corpo.type,
    };
  }
}
