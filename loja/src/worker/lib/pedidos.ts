import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { obterProvider } from "../payments";
import { requisicaoInvalida, naoEncontrado, ErroApi } from "./erros";
import type { Env } from "../env";
import type { Plataforma, StatusPedido } from "@shared/types";

/** Validade do QR Code. Curta o bastante para não travar estoque à toa. */
const MINUTOS_VALIDADE = 30;
/** Valor mínimo de uma doação de valor livre, em centavos. */
const MINIMO_LIVRE = 100;
/** Teto por pedido, como freio contra erro de digitação e abuso. */
const MAXIMO_QUANTIDADE = 10;

/**
 * Transições permitidas do pedido.
 *
 * Escrito como dado, e não espalhado em `if`s, para que uma entrega dupla ou um
 * pedido expirado "voltando" a pago seja impossível por construção.
 */
const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  aguardando_pagamento: ["pago", "expirado", "cancelado"],
  pago: ["entregue", "reembolsado", "cancelado"],
  entregue: ["reembolsado"],
  expirado: [],
  cancelado: [],
  reembolsado: [],
};

export function transicaoValida(de: StatusPedido, para: StatusPedido): boolean {
  return TRANSICOES[de].includes(para);
}

export interface EntradaCheckout {
  produtoSlug: string;
  quantidade: number;
  /** Só para produtos de valor livre; ignorado nos demais. */
  valorCentavos?: number;
  nick: string;
  plataforma: Plataforma;
  email: string;
  nickPresenteado?: string;
}

/**
 * Cria o pedido e a cobrança Pix.
 *
 * O preço NUNCA vem do cliente: a entrada traz apenas o slug do produto e a
 * quantidade, e o total é recalculado a partir do que está gravado no D1.
 */
export async function criarPedido(env: Env, entrada: EntradaCheckout, origem: string, ip: string | null) {
  const banco = db(env);

  const [produto] = await banco
    .select()
    .from(schema.produtos)
    .where(and(eq(schema.produtos.slug, entrada.produtoSlug), eq(schema.produtos.ativo, true)))
    .limit(1);

  if (!produto) throw naoEncontrado("Produto");

  const quantidade = produto.precoLivre
    ? 1
    : Math.min(MAXIMO_QUANTIDADE, Math.max(1, Math.trunc(entrada.quantidade)));

  if (produto.estoque !== null && produto.estoque < quantidade) {
    throw requisicaoInvalida("Não há estoque suficiente para este produto.");
  }

  if (!produto.presenteavel && entrada.nickPresenteado) {
    throw requisicaoInvalida("Este produto não pode ser presenteado.");
  }

  // Preço unitário: o do banco, ou o escolhido pelo comprador quando o produto
  // é de valor livre — respeitando o mínimo, também do banco.
  let precoUnitario: number;
  if (produto.precoLivre) {
    const escolhido = Math.trunc(entrada.valorCentavos ?? 0);
    const minimo = Math.max(MINIMO_LIVRE, produto.precoCentavos);
    if (escolhido < minimo) {
      throw requisicaoInvalida(`O valor mínimo para este produto é de ${minimo} centavos.`);
    }
    precoUnitario = escolhido;
  } else {
    precoUnitario = produto.precoCentavos;
  }

  const totalCentavos = precoUnitario * quantidade;
  const publicId = crypto.randomUUID().replace(/-/g, "");

  const provider = obterProvider(env);
  const cobranca = await provider.criarCobrancaPix({
    referencia: publicId,
    totalCentavos,
    descricao: `${produto.nome} - pedido ${publicId.slice(0, 8)}`,
    emailPagador: entrada.email,
    urlWebhook: `${origem}/api/webhook/pix`,
    minutosValidade: MINUTOS_VALIDADE,
  });

  const [pedido] = await banco
    .insert(schema.pedidos)
    .values({
      publicId,
      nick: entrada.nick,
      plataforma: entrada.plataforma,
      email: entrada.email,
      nickPresenteado: entrada.nickPresenteado ?? null,
      totalCentavos,
      status: "aguardando_pagamento",
      provider: provider.nome,
      providerChargeId: cobranca.chargeId,
      pixCopiaCola: cobranca.copiaCola,
      pixQrBase64: cobranca.qrBase64,
      expiraEm: Math.floor(cobranca.expiraEm.getTime() / 1000),
      ip,
    })
    .returning({ id: schema.pedidos.id });

  // Snapshot imutável: mudar o preço do produto amanhã não pode reescrever
  // o que foi vendido hoje.
  await banco.insert(schema.pedidoItens).values({
    pedidoId: pedido.id,
    produtoId: produto.id,
    nome: produto.nome,
    precoCentavos: precoUnitario,
    quantidade,
    imagemKey: produto.imagemKey,
  });

  return { publicId, totalCentavos };
}

/**
 * Marca um pedido como pago.
 *
 * Idempotente e defensiva: recusa transição inválida e recusa valor divergente
 * do total do pedido — pagar R$ 1,00 num VIP de R$ 20,00 não pode liberar nada.
 */
export async function marcarComoPago(
  env: Env,
  chargeId: string,
  valorPagoCentavos: number | null,
): Promise<"pago" | "ja_processado" | "divergente" | "desconhecido"> {
  const banco = db(env);

  const [pedido] = await banco
    .select()
    .from(schema.pedidos)
    .where(eq(schema.pedidos.providerChargeId, chargeId))
    .limit(1);

  if (!pedido) return "desconhecido";
  if (pedido.status !== "aguardando_pagamento") {
    // Já pago, entregue ou cancelado: nada a fazer. Não é erro — o gateway
    // reenvia o mesmo evento várias vezes.
    return "ja_processado";
  }

  if (valorPagoCentavos !== null && valorPagoCentavos !== pedido.totalCentavos) {
    await banco
      .update(schema.pedidos)
      .set({
        notaAdmin:
          `Valor pago (${valorPagoCentavos} centavos) diferente do total do pedido ` +
          `(${pedido.totalCentavos} centavos). Revisar manualmente.`,
      })
      .where(eq(schema.pedidos.id, pedido.id));
    return "divergente";
  }

  // A condição de status no WHERE fecha a corrida entre webhook e cron: se os
  // dois chegarem juntos, só um dos UPDATEs encontra a linha ainda aguardando.
  const atualizados = await banco
    .update(schema.pedidos)
    .set({ status: "pago", pagoEm: Math.floor(Date.now() / 1000) })
    .where(
      and(eq(schema.pedidos.id, pedido.id), eq(schema.pedidos.status, "aguardando_pagamento")),
    )
    .returning({ id: schema.pedidos.id });

  if (atualizados.length === 0) return "ja_processado";

  // Baixa de estoque só depois do pagamento confirmado, e só para produtos que
  // controlam estoque.
  const itens = await banco
    .select()
    .from(schema.pedidoItens)
    .where(eq(schema.pedidoItens.pedidoId, pedido.id));

  for (const item of itens) {
    await banco
      .update(schema.produtos)
      .set({ estoque: sql`MAX(0, ${schema.produtos.estoque} - ${item.quantidade})` })
      .where(and(eq(schema.produtos.id, item.produtoId), sql`${schema.produtos.estoque} IS NOT NULL`));
  }

  return "pago";
}

/** Muda o status de um pedido validando a transição. Usado pelo painel admin. */
export async function mudarStatus(
  env: Env,
  publicId: string,
  novo: StatusPedido,
  autor: string,
) {
  const banco = db(env);
  const [pedido] = await banco
    .select()
    .from(schema.pedidos)
    .where(eq(schema.pedidos.publicId, publicId))
    .limit(1);

  if (!pedido) throw naoEncontrado("Pedido");

  if (!transicaoValida(pedido.status, novo)) {
    throw new ErroApi(409, `Não é possível mudar o pedido de "${pedido.status}" para "${novo}".`);
  }

  const agora = Math.floor(Date.now() / 1000);
  await banco
    .update(schema.pedidos)
    .set({
      status: novo,
      ...(novo === "entregue" ? { entregueEm: agora, entreguePor: autor } : {}),
    })
    .where(and(eq(schema.pedidos.id, pedido.id), eq(schema.pedidos.status, pedido.status)));
}

/**
 * Rede de segurança executada pelo cron.
 *
 * Reconsulta no gateway os pedidos ainda aguardando pagamento e expira os
 * vencidos. Sem isso, um webhook perdido vira um cliente que pagou e nunca
 * recebeu o item — e o dono só descobre pela reclamação.
 */
export async function reconciliarPedidos(env: Env) {
  const banco = db(env);
  const agora = Math.floor(Date.now() / 1000);

  const pendentes = await banco
    .select({
      publicId: schema.pedidos.publicId,
      chargeId: schema.pedidos.providerChargeId,
      expiraEm: schema.pedidos.expiraEm,
    })
    .from(schema.pedidos)
    .where(eq(schema.pedidos.status, "aguardando_pagamento"))
    .limit(100);

  const provider = obterProvider(env);
  const expirar: string[] = [];

  for (const pedido of pendentes) {
    if (!pedido.chargeId) continue;
    try {
      const situacao = await provider.consultarCobranca(pedido.chargeId);
      if (situacao.status === "pago") {
        await marcarComoPago(env, pedido.chargeId, situacao.valorPagoCentavos);
      } else if (pedido.expiraEm !== null && pedido.expiraEm < agora) {
        expirar.push(pedido.publicId);
      }
    } catch (e) {
      // Uma cobrança que falha na consulta não pode derrubar a reconciliação
      // das outras.
      console.error(`Falha ao reconciliar ${pedido.publicId}:`, e);
    }
  }

  if (expirar.length > 0) {
    await banco
      .update(schema.pedidos)
      .set({ status: "expirado" })
      .where(
        and(
          inArray(schema.pedidos.publicId, expirar),
          eq(schema.pedidos.status, "aguardando_pagamento"),
        ),
      );
  }

  // Varredura de segurança: qualquer pedido vencido há mais de uma hora que
  // tenha escapado do laço acima (ex.: sem chargeId) também expira.
  await banco
    .update(schema.pedidos)
    .set({ status: "expirado" })
    .where(
      and(
        eq(schema.pedidos.status, "aguardando_pagamento"),
        lt(schema.pedidos.expiraEm, agora - 3600),
      ),
    );
}
