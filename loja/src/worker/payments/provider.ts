/**
 * Contrato do provedor de pagamento.
 *
 * Existe para que trocar de gateway custe um arquivo, e não uma refatoração:
 * o tipo de conta do dono do servidor (CPF ou MEI) ainda não está definido, e
 * isso pode mudar qual gateway aceita o cadastro.
 */

/** Status normalizado — cada gateway tem o seu vocabulário; aqui é sempre este. */
export type StatusCobranca = "pendente" | "pago" | "expirado" | "cancelado" | "reembolsado";

export interface CobrancaPix {
  /** Identificador da cobrança no gateway. */
  chargeId: string;
  /** BR Code — o "copia e cola" do Pix. */
  copiaCola: string;
  /** PNG do QR Code em base64, sem o prefixo `data:`. Nulo se o gateway não enviar. */
  qrBase64: string | null;
  /** Momento em que a cobrança deixa de ser pagável. */
  expiraEm: Date;
}

export interface DadosCobranca {
  /** `public_id` do pedido — vira a referência externa no gateway. */
  referencia: string;
  totalCentavos: number;
  descricao: string;
  emailPagador: string;
  /** URL absoluta que o gateway chama quando o pagamento muda de estado. */
  urlWebhook: string;
  /** Minutos de validade do QR Code. */
  minutosValidade: number;
}

export interface SituacaoCobranca {
  status: StatusCobranca;
  /** Valor efetivamente pago, em centavos. Nulo enquanto não houver pagamento. */
  valorPagoCentavos: number | null;
}

export interface EventoWebhook {
  /** Id do evento no gateway. É a chave de idempotência. */
  eventoId: string;
  /** Id da cobrança a que o evento se refere. */
  chargeId: string;
  tipo: string;
}

export interface PaymentProvider {
  readonly nome: string;

  criarCobrancaPix(dados: DadosCobranca): Promise<CobrancaPix>;

  consultarCobranca(chargeId: string): Promise<SituacaoCobranca>;

  /**
   * Valida a assinatura do webhook contra o corpo CRU da requisição.
   * Nunca receba aqui um JSON re-serializado: a assinatura é sobre os bytes
   * originais, e qualquer reserialização a invalida.
   */
  verificarAssinaturaWebhook(corpoCru: string, cabecalhos: Headers): Promise<boolean>;

  /** Extrai o que importa do payload. Retorna null se o evento for irrelevante. */
  extrairEvento(corpoCru: string, cabecalhos: Headers): EventoWebhook | null;
}

/** Comparação de strings em tempo constante, para não vazar a assinatura por timing. */
export function comparaSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

/** HMAC-SHA256 em hexadecimal, via WebCrypto (não existe `node:crypto` aqui). */
export async function hmacSha256Hex(segredo: string, mensagem: string): Promise<string> {
  const codificador = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, codificador.encode(mensagem));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
