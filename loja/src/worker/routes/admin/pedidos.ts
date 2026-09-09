import { Hono } from "hono";
import { z } from "zod";
import { and, desc, inArray, sql } from "drizzle-orm";
import { db, schema } from "../../db/client";
import { exigirAdmin } from "../../lib/auth";
import { mudarStatus } from "../../lib/pedidos";
import { requisicaoInvalida } from "../../lib/erros";
import { paraIso } from "../../lib/mapeadores";
import { STATUS_PEDIDO } from "@shared/types";
import type { AppEnv } from "../../env";

export const pedidosAdmin = new Hono<AppEnv>();

pedidosAdmin.use("/admin/*", exigirAdmin);

/**
 * Fila de pedidos.
 *
 * Por padrão traz os **pagos** — é a tarefa diária do dono: ver quem pagou e
 * ainda não recebeu. Os demais status vêm por filtro explícito.
 */
pedidosAdmin.get("/admin/pedidos", async (c) => {
  const filtro = c.req.query("status") ?? "pago";
  const pagina = Math.max(0, Number(c.req.query("pagina") ?? 0));
  const porPagina = 25;

  const condicoes =
    filtro === "todos"
      ? []
      : [
          inArray(
            schema.pedidos.status,
            filtro.split(",").filter((s): s is (typeof STATUS_PEDIDO)[number] =>
              (STATUS_PEDIDO as readonly string[]).includes(s),
            ),
          ),
        ];

  const linhas = await db(c.env)
    .select()
    .from(schema.pedidos)
    .where(condicoes.length > 0 ? and(...condicoes) : undefined)
    .orderBy(desc(schema.pedidos.criadoEm))
    .limit(porPagina)
    .offset(pagina * porPagina);

  // Uma consulta só para os itens de todos os pedidos da página, em vez de uma
  // por pedido — leitura de linha é o que o free tier do D1 cobra.
  const ids = linhas.map((l) => l.id);
  const itens =
    ids.length > 0
      ? await db(c.env)
          .select()
          .from(schema.pedidoItens)
          .where(inArray(schema.pedidoItens.pedidoId, ids))
      : [];

  const porPedido = new Map<number, typeof itens>();
  for (const item of itens) {
    const lista = porPedido.get(item.pedidoId) ?? [];
    lista.push(item);
    porPedido.set(item.pedidoId, lista);
  }

  return c.json({
    pedidos: linhas.map((p) => ({
      publicId: p.publicId,
      nick: p.nick,
      plataforma: p.plataforma,
      nickPresenteado: p.nickPresenteado,
      email: p.email,
      status: p.status,
      totalCentavos: p.totalCentavos,
      notaAdmin: p.notaAdmin,
      entreguePor: p.entreguePor,
      criadoEm: paraIso(p.criadoEm),
      pagoEm: paraIso(p.pagoEm),
      entregueEm: paraIso(p.entregueEm),
      itens: (porPedido.get(p.id) ?? []).map((i) => ({
        nome: i.nome,
        quantidade: i.quantidade,
        precoCentavos: i.precoCentavos,
      })),
    })),
    pagina,
    temMais: linhas.length === porPagina,
  });
});

/** Contadores do topo do painel — o "quantos faltam entregar hoje". */
pedidosAdmin.get("/admin/pedidos/resumo", async (c) => {
  const linhas = await db(c.env)
    .select({ status: schema.pedidos.status, total: sql<number>`count(*)` })
    .from(schema.pedidos)
    .groupBy(schema.pedidos.status);

  const [receita] = await db(c.env)
    .select({ soma: sql<number>`coalesce(sum(${schema.pedidos.totalCentavos}), 0)` })
    .from(schema.pedidos)
    .where(inArray(schema.pedidos.status, ["pago", "entregue"]));

  return c.json({
    porStatus: Object.fromEntries(linhas.map((l) => [l.status, l.total])),
    receitaCentavos: receita?.soma ?? 0,
  });
});

const schemaStatus = z.object({
  status: z.enum(STATUS_PEDIDO),
  nota: z.string().max(500).optional(),
});

/**
 * Muda o status de um pedido. A validação da transição fica em `mudarStatus`,
 * que recusa qualquer caminho inválido (entregar duas vezes, "despagar" etc.).
 */
pedidosAdmin.post("/admin/pedidos/:publicId/status", async (c) => {
  const analise = schemaStatus.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) throw requisicaoInvalida("Status inválido.");

  await mudarStatus(
    c.env,
    c.req.param("publicId"),
    analise.data.status,
    c.get("adminEmail") ?? "admin",
    analise.data.nota,
  );

  return c.json({ ok: true });
});
