import { Hono } from "hono";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "../../db/client";
import { exigirAdmin } from "../../lib/auth";
import { naoEncontrado, requisicaoInvalida, ErroApi } from "../../lib/erros";
import { gerarSlug } from "../../lib/slug";
import { paraProduto } from "../../lib/mapeadores";
import type { AppEnv } from "../../env";

export const catalogoAdmin = new Hono<AppEnv>();

catalogoAdmin.use("/admin/*", exigirAdmin);

const schemaProduto = z.object({
  categoriaId: z.number().int().positive(),
  slug: z.string().trim().max(100).optional(),
  nome: z.string().trim().min(2).max(120),
  descricaoCurta: z.string().trim().max(200).nullable().optional(),
  descricaoMd: z.string().max(4000).nullable().optional(),
  precoCentavos: z.number().int().min(1).max(10_000_000),
  precoDeCentavos: z.number().int().min(0).max(10_000_000).nullable().optional(),
  duracaoDias: z.number().int().min(1).max(3650).nullable().optional(),
  imagemKey: z.string().max(200).nullable().optional(),
  presenteavel: z.boolean().optional(),
  precoLivre: z.boolean().optional(),
  destaque: z.boolean().optional(),
  estoque: z.number().int().min(0).max(100000).nullable().optional(),
  ordem: z.number().int().min(0).max(9999).optional(),
  ativo: z.boolean().optional(),
});

/** Lista TODOS os produtos, inclusive inativos — a vitrine só mostra os ativos. */
catalogoAdmin.get("/admin/produtos", async (c) => {
  const linhas = await db(c.env)
    .select({ produto: schema.produtos, categoria: schema.categorias })
    .from(schema.produtos)
    .innerJoin(schema.categorias, eq(schema.produtos.categoriaId, schema.categorias.id))
    .orderBy(asc(schema.categorias.ordem), asc(schema.produtos.ordem));

  return c.json(
    linhas.map((l) => ({ ...paraProduto(l.produto, l.categoria), ativo: l.produto.ativo })),
  );
});

catalogoAdmin.post("/admin/produtos", async (c) => {
  const analise = schemaProduto.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) throw requisicaoInvalida("Dados do produto inválidos.", analise.error.issues);

  const dados = analise.data;
  const slug = gerarSlug(dados.slug || dados.nome);
  if (!slug) throw requisicaoInvalida("Não foi possível gerar um endereço para este nome.");

  try {
    const [criado] = await db(c.env)
      .insert(schema.produtos)
      .values({ ...dados, slug })
      .returning({ id: schema.produtos.id, slug: schema.produtos.slug });
    return c.json(criado, 201);
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      throw new ErroApi(409, `Já existe um produto com o endereço "${slug}".`);
    }
    throw e;
  }
});

catalogoAdmin.put("/admin/produtos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const analise = schemaProduto.partial().safeParse(await c.req.json().catch(() => null));
  if (!analise.success) throw requisicaoInvalida("Dados do produto inválidos.", analise.error.issues);

  const { slug, ...resto } = analise.data;
  const atualizados = await db(c.env)
    .update(schema.produtos)
    .set({ ...resto, ...(slug ? { slug: gerarSlug(slug) } : {}) })
    .where(eq(schema.produtos.id, id))
    .returning({ id: schema.produtos.id });

  if (atualizados.length === 0) throw naoEncontrado("Produto");
  return c.json({ ok: true });
});

/**
 * Remoção do produto.
 *
 * Se o produto já foi vendido, ele é apenas desativado: apagar quebraria a
 * integridade de `pedido_itens` e sumiria com o histórico de vendas.
 */
catalogoAdmin.delete("/admin/produtos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const banco = db(c.env);

  const vendidos = await banco
    .select({ id: schema.pedidoItens.id })
    .from(schema.pedidoItens)
    .where(eq(schema.pedidoItens.produtoId, id))
    .limit(1);

  if (vendidos.length > 0) {
    await banco.update(schema.produtos).set({ ativo: false }).where(eq(schema.produtos.id, id));
    return c.json({ ok: true, desativado: true });
  }

  await banco.delete(schema.produtos).where(eq(schema.produtos.id, id));
  return c.json({ ok: true, removido: true });
});

const schemaCategoria = z.object({
  slug: z.string().trim().max(100).optional(),
  nome: z.string().trim().min(2).max(80),
  descricao: z.string().trim().max(200).nullable().optional(),
  icone: z.enum(["crown", "coins", "package", "key"]).nullable().optional(),
  ordem: z.number().int().min(0).max(999).optional(),
  ativo: z.boolean().optional(),
});

catalogoAdmin.get("/admin/categorias", async (c) => {
  const linhas = await db(c.env)
    .select()
    .from(schema.categorias)
    .orderBy(asc(schema.categorias.ordem));
  return c.json(linhas);
});

catalogoAdmin.post("/admin/categorias", async (c) => {
  const analise = schemaCategoria.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) throw requisicaoInvalida("Dados da categoria inválidos.");

  const dados = analise.data;
  const [criada] = await db(c.env)
    .insert(schema.categorias)
    .values({ ...dados, slug: gerarSlug(dados.slug || dados.nome) })
    .returning({ id: schema.categorias.id });

  return c.json(criada, 201);
});

catalogoAdmin.put("/admin/categorias/:id", async (c) => {
  const analise = schemaCategoria.partial().safeParse(await c.req.json().catch(() => null));
  if (!analise.success) throw requisicaoInvalida("Dados da categoria inválidos.");

  const { slug, ...resto } = analise.data;
  const atualizadas = await db(c.env)
    .update(schema.categorias)
    .set({ ...resto, ...(slug ? { slug: gerarSlug(slug) } : {}) })
    .where(eq(schema.categorias.id, Number(c.req.param("id"))))
    .returning({ id: schema.categorias.id });

  if (atualizadas.length === 0) throw naoEncontrado("Categoria");
  return c.json({ ok: true });
});

catalogoAdmin.delete("/admin/categorias/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const banco = db(c.env);

  const comProdutos = await banco
    .select({ id: schema.produtos.id })
    .from(schema.produtos)
    .where(eq(schema.produtos.categoriaId, id))
    .limit(1);

  if (comProdutos.length > 0) {
    throw new ErroApi(409, "Mova ou remova os produtos desta categoria antes de excluí-la.");
  }

  await banco.delete(schema.categorias).where(eq(schema.categorias.id, id));
  return c.json({ ok: true });
});

/** Configuração da loja: tudo que o dono muda sem precisar de deploy. */
const CHAVES_CONFIG = [
  "nome_servidor",
  "ip_servidor",
  "logo_url",
  "discord_convite",
  "prazo_entrega",
  "aviso_entrega",
  "termos_md",
  "reembolso_md",
] as const;

catalogoAdmin.get("/admin/config", async (c) => {
  const linhas = await db(c.env).select().from(schema.config);
  return c.json(Object.fromEntries(linhas.map((l) => [l.chave, l.valor])));
});

catalogoAdmin.put("/admin/config", async (c) => {
  const corpo = (await c.req.json().catch(() => null)) as Record<string, string> | null;
  if (!corpo) throw requisicaoInvalida("Corpo inválido.");

  const banco = db(c.env);
  for (const [chave, valor] of Object.entries(corpo)) {
    // Lista fechada: sem isso, qualquer chave entraria na tabela de config.
    if (!CHAVES_CONFIG.includes(chave as (typeof CHAVES_CONFIG)[number])) continue;

    await banco
      .insert(schema.config)
      .values({ chave, valor: String(valor).slice(0, 4000) })
      .onConflictDoUpdate({
        target: schema.config.chave,
        set: { valor: String(valor).slice(0, 4000), atualizadoEm: Math.floor(Date.now() / 1000) },
      });
  }

  return c.json({ ok: true });
});
