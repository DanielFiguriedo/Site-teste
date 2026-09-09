import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { obterProvider, obterProviderPorNome } from "../payments";
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
 * Quantos pedidos são reconsultados por rodada do cron.
 *
 * O Workers limita as subrequisições por invocação (50 no plano gratuito), e
 * cada pedido custa uma chamada ao gateway. Pedir mais do que cabe faria o lote
 * inteiro falhar no meio, rodada após rodada.
 */
const POR_RODADA = 20;
/** Pedidos não pagos que um mesmo IP pode ter em aberto ao mesmo tempo. */
const PENDENTES_POR_IP = 8;

/**
 * Transições permitidas do pedido.
 *
 * Escrito como dado, e não espalhado em `if`s, para que uma entrega dupla ou um
 * pedido expirado "voltando" a pago seja impossível por construção.
 */
const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  aguardando_pagamento: ["pago", "expirado", "cancelado", "em_revisao"],
  // Um pedido em revisão foi pago de um jeito que não bate com o esperado
  // (valor divergente, valor desconhecido, pago depois de expirar). Só uma
  // pessoa decide o destino dele.
  em_revisao: ["pago", "cancelado", "reembolsado"],
  pago: ["entregue", "reembolsado", "cancelado"],
  entregue: ["reembolsado"],
  expirado: ["em_revisao"],
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
export async function criarPedido(
  env: Env,
  entrada: EntradaCheckout,
  origem: string,
  ip: string | null,
) {
  const banco = db(env);

  // Freio de abuso independente do Turnstile: sem ele, um script encheria a
  // fila de pendentes e afogaria a reconciliação do cron.
  if (ip) {
    const [{ abertos }] = await banco
      .select({ abertos: sql<number>`count(*)` })
      .from(schema.pedidos)
      .where(
        and(
          eq(schema.pedidos.ip, ip),
          eq(schema.pedidos.status, "aguardando_pagamento"),
          sql`${schema.pedidos.criadoEm} > unixepoch() - 3600`,
        ),
      );

    if (abertos >= PENDENTES_POR_IP) {
      throw new ErroApi(
        429,
        "Você tem pedidos demais aguardando pagamento. Pague ou aguarde eles expirarem.",
      );
    }
  }

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

export type ResultadoPagamento =
  | "pago"
  | "ja_processado"
  | "em_revisao"
  | "desconhecido";

/** Marca o pedido para conferência humana, sem creditar nada. */
async function enviarParaRevisao(env: Env, pedidoId: number, de: StatusPedido, motivo: string) {
  await db(env)
    .update(schema.pedidos)
    .set({ status: "em_revisao", notaAdmin: motivo })
    .where(and(eq(schema.pedidos.id, pedidoId), eq(schema.pedidos.status, de)));
}

/**
 * Marca um pedido como pago.
 *
 * Idempotente e defensiva. Qualquer situação que não seja "o valor exato do
 * pedido, num pedido que ainda esperava pagamento" vai para revisão manual em
 * vez de creditar — inclusive o pagamento que chega depois do pedido expirar,
 * que antes sumia em silêncio.
 */
export async function marcarComoPago(
  env: Env,
  chargeId: string,
  valorPagoCentavos: number | null,
): Promise<ResultadoPagamento> {
  const banco = db(env);

  const [pedido] = await banco
    .select()
    .from(schema.pedidos)
    .where(eq(schema.pedidos.providerChargeId, chargeId))
    .limit(1);

  if (!pedido) return "desconhecido";

  // Pagamento confirmado num pedido que já tinha sido dado como perdido: não
  // pode ser ignorado, porque o dinheiro entrou de verdade.
  if (pedido.status === "expirado") {
    await enviarParaRevisao(
      env,
      pedido.id,
      "expirado",
      "Pagamento confirmado depois de o pedido expirar. Conferir no gateway antes de entregar.",
    );
    return "em_revisao";
  }

  if (pedido.status !== "aguardando_pagamento") {
    // Já pago, entregue, cancelado ou em revisão: nada a fazer. Não é erro — o
    // gateway reenvia o mesmo evento várias vezes.
    return "ja_processado";
  }

  if (valorPagoCentavos === null) {
    // Valor desconhecido não é o mesmo que valor conferido.
    await enviarParaRevisao(
      env,
      pedido.id,
      "aguardando_pagamento",
      "O gateway confirmou o pagamento mas não informou o valor. Conferir antes de entregar.",
    );
    return "em_revisao";
  }

  if (valorPagoCentavos !== pedido.totalCentavos) {
    await enviarParaRevisao(
      env,
      pedido.id,
      "aguardando_pagamento",
      `Valor pago (${valorPagoCentavos} centavos) diferente do total do pedido ` +
        `(${pedido.totalCentavos} centavos). Conferir antes de entregar.`,
    );
    return "em_revisao";
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

  await baixarEstoque(env, pedido.id);
  return "pago";
}

/**
 * Baixa o estoque dos itens do pedido, depois do pagamento confirmado.
 *
 * Se o estoque não cobrir a quantidade, o pedido é anotado em vez de a falta
 * ser zerada em silêncio: sem essa anotação, o dono receberia na fila um item
 * que não tem para entregar e só descobriria na hora de entregar.
 */
async function baixarEstoque(env: Env, pedidoId: number) {
  const banco = db(env);
  const itens = await banco
    .select()
    .from(schema.pedidoItens)
    .where(eq(schema.pedidoItens.pedidoId, pedidoId));

  const semLastro: string[] = [];

  for (const item of itens) {
    const [produto] = await banco
      .select({ estoque: schema.produtos.estoque })
      .from(schema.produtos)
      .where(eq(schema.produtos.id, item.produtoId))
      .limit(1);

    if (!produto || produto.estoque === null) continue;

    if (produto.estoque < item.quantidade) semLastro.push(item.nome);

    await banco
      .update(schema.produtos)
      .set({ estoque: sql`MAX(0, ${schema.produtos.estoque} - ${item.quantidade})` })
      .where(eq(schema.produtos.id, item.produtoId));
  }

  if (semLastro.length > 0) {
    await banco
      .update(schema.pedidos)
      .set({
        notaAdmin: `Estoque insuficiente no momento do pagamento: ${semLastro.join(", ")}.`,
      })
      .where(eq(schema.pedidos.id, pedidoId));
  }
}

/** Muda o status de um pedido validando a transição. Usado pelo painel admin. */
export async function mudarStatus(
  env: Env,
  publicId: string,
  novo: StatusPedido,
  autor: string,
  nota?: string,
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
  const atualizados = await banco
    .update(schema.pedidos)
    .set({
      status: novo,
      ...(nota !== undefined ? { notaAdmin: nota } : {}),
      ...(novo === "entregue" ? { entregueEm: agora, entreguePor: autor } : {}),
    })
    // A guarda de status no WHERE é o que impede dois administradores de
    // entregarem o mesmo pedido: o segundo UPDATE não encontra mais a linha.
    .where(and(eq(schema.pedidos.id, pedido.id), eq(schema.pedidos.status, pedido.status)))
    .returning({ id: schema.pedidos.id });

  if (atualizados.length === 0) {
    throw new ErroApi(
      409,
      "Este pedido acabou de ser alterado por outra pessoa. Atualize a página.",
    );
  }
}

/**
 * Rede de segurança executada pelo cron.
 *
 * Reconsulta no gateway os pedidos ainda aguardando pagamento e expira apenas
 * os que o gateway confirmou como não pagos. Um pedido só é expirado às cegas
 * quando não há cobrança para consultar — expirar sem perguntar transformaria
 * uma instabilidade do gateway em cliente que pagou e ficou sem o item.
 */
export async function reconciliarPedidos(env: Env) {
  const banco = db(env);
  const agora = Math.floor(Date.now() / 1000);

  const pendentes = await banco
    .select({
      publicId: schema.pedidos.publicId,
      chargeId: schema.pedidos.providerChargeId,
      provider: schema.pedidos.provider,
      expiraEm: schema.pedidos.expiraEm,
    })
    .from(schema.pedidos)
    .where(eq(schema.pedidos.status, "aguardando_pagamento"))
    // Ordena por vencimento, não por criação. Sem ordenação, o D1 devolve
    // praticamente as mesmas linhas toda rodada e a cauda nunca é consultada;
    // e ordenar por criação faria um pedido recém-vencido esperar atrás de uma
    // fila de pedidos ainda válidos. Quem está mais perto de vencer é quem
    // precisa de uma decisão agora — e, resolvido, libera a vaga.
    .orderBy(asc(schema.pedidos.expiraEm))
    .limit(POR_RODADA);

  const expirar: string[] = [];

  for (const pedido of pendentes) {
    if (!pedido.chargeId) continue;
    try {
      // O provedor vem do pedido, não da configuração atual: trocar de gateway
      // não pode deixar os pedidos antigos sem quem os consulte.
      const provider = obterProviderPorNome(env, pedido.provider);
      const situacao = await provider.consultarCobranca(pedido.chargeId);

      if (situacao.status === "pago") {
        await marcarComoPago(env, pedido.chargeId, situacao.valorPagoCentavos);
      } else if (pedido.expiraEm !== null && pedido.expiraEm < agora) {
        // Expira só porque o gateway confirmou que não foi pago.
        expirar.push(pedido.publicId);
      }
    } catch (e) {
      // Uma cobrança que falha na consulta não pode derrubar a reconciliação
      // das outras — e, por não entrar em `expirar`, continua pendente para a
      // próxima rodada em vez de virar um pedido perdido.
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

  // Pedidos sem cobrança no gateway não têm o que ser consultado: aqui expirar
  // às cegas é seguro, porque nenhum Pix chegou a ser gerado para eles.
  await banco
    .update(schema.pedidos)
    .set({ status: "expirado" })
    .where(
      and(
        eq(schema.pedidos.status, "aguardando_pagamento"),
        isNull(schema.pedidos.providerChargeId),
        lt(schema.pedidos.expiraEm, agora),
      ),
    );
}
