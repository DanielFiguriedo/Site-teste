import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { obterProvider } from "../payments";
import { marcarComoPago } from "../lib/pedidos";
import type { AppEnv } from "../env";

export const webhook = new Hono<AppEnv>();

/**
 * Violação de UNIQUE é evento repetido; qualquer outro erro é falha nossa.
 *
 * A mensagem precisa ser procurada na cadeia de causas: o Drizzle embrulha o
 * erro do D1 num `DrizzleQueryError` cujo próprio `message` é apenas
 * "Failed query: insert into ..." — o texto do UNIQUE fica no `cause`.
 */
export function ehEventoDuplicado(e: unknown): boolean {
  for (let atual: unknown = e, salto = 0; atual && salto < 5; salto++) {
    const texto = atual instanceof Error ? atual.message : String(atual);
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(texto)) return true;
    atual = atual instanceof Error ? atual.cause : undefined;
  }
  return false;
}

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
 * Um 200 diz ao gateway "recebi, não reenvie". Por isso ele só sai quando o
 * evento realmente foi registrado: erro de infraestrutura devolve 500 de
 * propósito, para o gateway reenfileirar.
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
  } catch (e) {
    if (ehEventoDuplicado(e)) return c.json({ ok: true, duplicado: true });

    // Um erro transitório do banco tratado como "duplicado" faria o gateway
    // parar de reenviar um evento que nunca foi processado.
    console.error("Falha ao registrar o evento de webhook:", e);
    return c.json({ erro: "Falha temporária. Reenvie." }, 500);
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

          if (resultado === "desconhecido") {
            // Dinheiro que entrou sem pedido correspondente. Não há o que
            // creditar, mas some dos logs se não for dito em voz alta.
            console.error(
              `Pagamento confirmado para a cobrança ${evento.chargeId}, que não existe no banco.`,
            );
          }
        }
      } catch (e) {
        console.error(`Falha ao processar o webhook ${evento.eventoId}:`, e);

        // Apaga a marca de idempotência para que um reenvio do gateway possa
        // tentar de novo. Sem isso, a única chance restante seria o cron.
        await db(c.env)
          .delete(schema.webhookEventos)
          .where(
            and(
              eq(schema.webhookEventos.provider, provider.nome),
              eq(schema.webhookEventos.eventoId, evento.eventoId),
            ),
          )
          .catch(() => undefined);
      }
    })(),
  );

  return c.json({ ok: true });
});
