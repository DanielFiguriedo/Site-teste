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

/**
 * Provedor simulado, usado apenas em desenvolvimento.
 *
 * Existe por um motivo concreto: o sandbox do Mercado Pago **não permite pagar
 * um Pix de verdade**. Sem este mock, não haveria como exercitar o fluxo
 * completo (cobrança → QR → webhook → fila de entrega) antes de ir ao ar.
 *
 * O estado das cobranças fica no KV; a rota de desenvolvimento
 * `/api/dev/simular-pagamento` marca uma cobrança como paga e dispara o mesmo
 * caminho de webhook que o gateway real usaria.
 */
export class MockProvider implements PaymentProvider {
  readonly nome = "mock";

  constructor(
    private readonly kv: KVNamespace,
    private readonly segredo: string,
  ) {}

  private chave(chargeId: string) {
    return `mock:cobranca:${chargeId}`;
  }

  async criarCobrancaPix(dados: DadosCobranca): Promise<CobrancaPix> {
    const chargeId = `mock_${crypto.randomUUID()}`;
    const expiraEm = new Date(Date.now() + dados.minutosValidade * 60_000);

    await this.kv.put(
      this.chave(chargeId),
      JSON.stringify({
        status: "pendente" satisfies StatusCobranca,
        totalCentavos: dados.totalCentavos,
        referencia: dados.referencia,
      }),
      // Sobrevive à expiração da cobrança para o cron ainda conseguir consultá-la.
      { expirationTtl: Math.max(60, dados.minutosValidade * 60 * 2) },
    );

    return {
      chargeId,
      // Formato inspirado no BR Code só para a tela ficar realista. Não é um
      // Pix válido — e não deve ser: isto nunca roda em produção.
      copiaCola:
        `00020126580014BR.GOV.BCB.PIX0136${chargeId}520400005303986540` +
        `${(dados.totalCentavos / 100).toFixed(2)}5802BR5913LOJA SIMULADA6009SAO PAULO62070503***6304MOCK`,
      qrBase64: null,
      expiraEm,
    };
  }

  async consultarCobranca(chargeId: string): Promise<SituacaoCobranca> {
    const bruto = await this.kv.get(this.chave(chargeId));
    if (!bruto) return { status: "expirado", valorPagoCentavos: null };

    const dados = JSON.parse(bruto) as { status: StatusCobranca; totalCentavos: number };
    return {
      status: dados.status,
      valorPagoCentavos: dados.status === "pago" ? dados.totalCentavos : null,
    };
  }

  /** Marca a cobrança como paga. Só a rota de desenvolvimento chama isto. */
  async simularPagamento(chargeId: string): Promise<boolean> {
    const bruto = await this.kv.get(this.chave(chargeId));
    if (!bruto) return false;

    const dados = JSON.parse(bruto) as Record<string, unknown>;
    await this.kv.put(this.chave(chargeId), JSON.stringify({ ...dados, status: "pago" }), {
      expirationTtl: 3600,
    });
    return true;
  }

  /** Monta o corpo e o cabeçalho que o webhook simulado vai receber. */
  async montarWebhook(chargeId: string): Promise<{ corpo: string; assinatura: string }> {
    const corpo = JSON.stringify({
      id: `evt_${crypto.randomUUID()}`,
      type: "payment",
      action: "payment.updated",
      data: { id: chargeId },
    });
    return { corpo, assinatura: await hmacSha256Hex(this.segredo, corpo) };
  }

  async verificarAssinaturaWebhook(corpoCru: string, cabecalhos: Headers): Promise<boolean> {
    const enviada = cabecalhos.get("x-mock-signature");
    if (!enviada) return false;
    return comparaSegura(await hmacSha256Hex(this.segredo, corpoCru), enviada);
  }

  extrairEvento(corpoCru: string): EventoWebhook | null {
    try {
      const corpo = JSON.parse(corpoCru) as {
        id?: string;
        type?: string;
        action?: string;
        data?: { id?: string };
      };
      if (corpo.type !== "payment" || !corpo.data?.id || !corpo.id) return null;
      return { eventoId: corpo.id, chargeId: corpo.data.id, tipo: corpo.action ?? "payment" };
    } catch {
      return null;
    }
  }
}
