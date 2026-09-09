import { Hono } from "hono";
import { db, schema } from "../db/client";
import { obterProvider } from "../payments";
import { marcarComoPago } from "../lib/pedidos";
import type { AppEnv } from "../env";

export const webhook = new Hono<AppEnv>();

/**
 * Confirmação de pagamento vinda do gateway.
 *
 * A ordem dos passos aqui é a segurança do sistema inteiro:
 *   1. ler o corpo CRU uma única vez;
 *   2. validar a assinatura contra esse corpo cru (primeiro portão);
 *   3. registrar o evento de forma idempotente (impede crédito duplicado);
 *   4. reconsultar a cobrança na API do gateway (defesa real);
 *   5. só então marcar o pedido como pago.
 *
 * Responde 200 em quase todo caso: um erro devolvido faz o gateway reenfileirar
 * o evento indefinidamente, e alguns provedores pausam a fila inteira da conta.
 */
webhook.post("/webhook/pix", async (c) => {
  // Passo 1 — uma leitura só. Reler o body lança "Body has already been used",
  // e re-serializar o JSON invalidaria a assinatura.
  const corpoCru = await c.req.text();
  const cabecalhos = c.req.raw.headers;

  const provider = obterProvider(c.env);

  // Passo 2.
  if (!(await provider.verificarAssinaturaWebhook(corpoCru, cabecalhos))) {
    console.warn("Webhook com assinatura inválida recusado.");
    return c.json({ erro: "Assinatura inválida." }, 401);
  }

  const evento = provider.extrairEvento(corpoCru, cabecalhos);
  if (!evento) return c.json({ ok: true, ignorado: true });

  // Passo 3 — a UNIQUE em (provider, evento_id) é o que impede o mesmo evento
  // reenviado de creditar o pedido duas vezes.
  try {
    await db(c.env)
      .insert(schema.webhookEventos)
      .values({
        provider: provider.nome,
        eventoId: evento.eventoId,
        tipo: evento.tipo,
        payload: corpoCru.slice(0, 4000),
      });
  } catch {
    return c.json({ ok: true, duplicado: true });
  }

  // Passos 4 e 5 rodam depois da resposta: o gateway recebe o 200 imediatamente
  // e não reenfileira por lentidão nossa.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const situacao = await provider.consultarCobranca(evento.chargeId);
        if (situacao.status === "pago") {
          const resultado = await marcarComoPago(
            c.env,
            evento.chargeId,
            situacao.valorPagoCentavos,
          );
          console.log(`Webhook ${evento.eventoId} -> ${resultado}`);
        }
      } catch (e) {
        // O pedido continua como aguardando_pagamento e o cron de reconciliação
        // tenta de novo em até 5 minutos.
        console.error(`Falha ao processar o webhook ${evento.eventoId}:`, e);
      }
    })(),
  );

  return c.json({ ok: true });
});
