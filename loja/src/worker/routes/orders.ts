import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { naoEncontrado } from "../lib/erros";
import { paraIso, urlImagem } from "../lib/mapeadores";
import type { AppEnv } from "../env";
import type { Pedido } from "@shared/types";

export const pedidosPublicos = new Hono<AppEnv>();

/**
 * Consulta pública do pedido pelo `public_id`.
 *
 * O `public_id` é um token aleatório de 32 caracteres, justamente para que este
 * endereço não seja adivinhável — o id sequencial nunca sai do banco.
 */
pedidosPublicos.get("/pedidos/:publicId", async (c) => {
  const banco = db(c.env);
  const publicId = c.req.param("publicId");

  const [pedido] = await banco
    .select()
    .from(schema.pedidos)
    .where(eq(schema.pedidos.publicId, publicId))
    .limit(1);

  if (!pedido) throw naoEncontrado("Pedido");

  const itens = await banco
    .select()
    .from(schema.pedidoItens)
    .where(eq(schema.pedidoItens.pedidoId, pedido.id));

  const resposta: Pedido = {
    publicId: pedido.publicId,
    nick: pedido.nick,
    plataforma: pedido.plataforma,
    nickPresenteado: pedido.nickPresenteado,
    status: pedido.status,
    totalCentavos: pedido.totalCentavos,
    itens: itens.map((i) => ({
      produtoId: i.produtoId,
      nome: i.nome,
      precoCentavos: i.precoCentavos,
      quantidade: i.quantidade,
      imagemUrl: urlImagem(i.imagemKey),
    })),
    // O QR só é devolvido enquanto a cobrança ainda é pagável; depois disso ele
    // é lixo na tela e pode induzir um segundo pagamento.
    pixCopiaCola: pedido.status === "aguardando_pagamento" ? pedido.pixCopiaCola : null,
    pixQrBase64: pedido.status === "aguardando_pagamento" ? pedido.pixQrBase64 : null,
    expiraEm: paraIso(pedido.expiraEm),
    criadoEm: paraIso(pedido.criadoEm)!,
    pagoEm: paraIso(pedido.pagoEm),
    entregueEm: paraIso(pedido.entregueEm),
  };

  // A tela de pagamento consulta este endereço em laço; nada aqui pode ficar
  // guardado em cache.
  c.header("cache-control", "no-store");
  return c.json(resposta);
});
