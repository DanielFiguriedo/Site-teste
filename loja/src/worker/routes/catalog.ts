import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { paraCategoria, paraProduto } from "../lib/mapeadores";
import { naoEncontrado } from "../lib/erros";
import type { AppEnv } from "../env";
import type { ConfigLoja } from "@shared/types";

export const catalogo = new Hono<AppEnv>();

/** Configuração pública da loja (nome, IP, prazo de entrega). */
catalogo.get("/config", async (c) => {
  const linhas = await db(c.env).select().from(schema.config);
  const mapa = new Map(linhas.map((l) => [l.chave, l.valor]));

  const cfg: ConfigLoja = {
    nomeServidor: mapa.get("nome_servidor") || "Loja Oficial",
    ipServidor: mapa.get("ip_servidor") || null,
    logoUrl: mapa.get("logo_url") || null,
    discordConvite: mapa.get("discord_convite") || null,
    prazoEntrega: mapa.get("prazo_entrega") || "em até 24 horas",
    avisoEntrega:
      mapa.get("aviso_entrega") ||
      "A entrega é feita manualmente pela nossa equipe após a confirmação do Pix.",
    termosMd: mapa.get("termos_md") || null,
    reembolsoMd: mapa.get("reembolso_md") || null,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
  };
  return c.json(cfg);
});

catalogo.get("/categorias", async (c) => {
  const linhas = await db(c.env)
    .select()
    .from(schema.categorias)
    .where(eq(schema.categorias.ativo, true))
    .orderBy(asc(schema.categorias.ordem));

  return c.json(linhas.map(paraCategoria));
});

/**
 * Lista de produtos ativos. `?categoria=<slug>` filtra; `?destaque=1` traz só
 * os destacados (usado na home).
 */
catalogo.get("/produtos", async (c) => {
  const slugCategoria = c.req.query("categoria");
  const soDestaque = c.req.query("destaque") === "1";

  const filtros = [eq(schema.produtos.ativo, true)];
  if (slugCategoria) filtros.push(eq(schema.categorias.slug, slugCategoria));
  if (soDestaque) filtros.push(eq(schema.produtos.destaque, true));

  const linhas = await db(c.env)
    .select({ produto: schema.produtos, categoria: schema.categorias })
    .from(schema.produtos)
    .innerJoin(schema.categorias, eq(schema.produtos.categoriaId, schema.categorias.id))
    .where(and(...filtros))
    .orderBy(asc(schema.categorias.ordem), asc(schema.produtos.ordem));

  return c.json(linhas.map((l) => paraProduto(l.produto, l.categoria)));
});

catalogo.get("/produtos/:slug", async (c) => {
  const [linha] = await db(c.env)
    .select({ produto: schema.produtos, categoria: schema.categorias })
    .from(schema.produtos)
    .innerJoin(schema.categorias, eq(schema.produtos.categoriaId, schema.categorias.id))
    .where(and(eq(schema.produtos.slug, c.req.param("slug")), eq(schema.produtos.ativo, true)))
    .limit(1);

  if (!linha) throw naoEncontrado("Produto");
  return c.json(paraProduto(linha.produto, linha.categoria));
});

/** Serve as imagens de produto guardadas no R2. */
catalogo.get("/imagens/:key{.+}", async (c) => {
  const objeto = await c.env.BUCKET.get(c.req.param("key"));
  if (!objeto) throw naoEncontrado("Imagem");

  const headers = new Headers();
  objeto.writeHttpMetadata(headers);
  headers.set("etag", objeto.httpEtag);
  // A chave inclui um hash do conteúdo, então o cache pode ser agressivo.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(objeto.body, { headers });
});
