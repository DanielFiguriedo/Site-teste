import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const agora = sql`(unixepoch())`;

/**
 * Categorias da loja (VIP, Cash, Itens e Kits, Chaves).
 *
 * `parentId` existe desde já para o dia em que o servidor tiver modalidades
 * (Survival, OneBlock...). Hoje todas as categorias são planas — criar a coluna
 * agora evita uma migração dolorosa depois.
 */
export const categorias = sqliteTable(
  "categorias",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id"),
    slug: text("slug").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    icone: text("icone"),
    ordem: integer("ordem").notNull().default(0),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    criadoEm: integer("criado_em").notNull().default(agora),
  },
  (t) => [uniqueIndex("idx_categorias_slug").on(t.slug), index("idx_categorias_ordem").on(t.ordem)],
);

/** Produtos vendidos. Todo dinheiro é inteiro em centavos. */
export const produtos = sqliteTable(
  "produtos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoriaId: integer("categoria_id")
      .notNull()
      .references(() => categorias.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    nome: text("nome").notNull(),
    descricaoCurta: text("descricao_curta"),
    /** Markdown — usado no bloco "o que você vai receber". */
    descricaoMd: text("descricao_md"),
    precoCentavos: integer("preco_centavos").notNull(),
    /** Preço "de" (riscado). Nulo quando não há promoção. */
    precoDeCentavos: integer("preco_de_centavos"),
    promocaoExpiraEm: integer("promocao_expira_em"),
    /** Nulo = permanente. Preenchido nos VIPs por tempo (30, 90 dias...). */
    duracaoDias: integer("duracao_dias"),
    /** Chave do objeto no R2. A URL pública é montada pelo Worker. */
    imagemKey: text("imagem_key"),
    presenteavel: integer("presenteavel", { mode: "boolean" }).notNull().default(true),
    /** Doação de valor livre: o comprador escolhe, respeitando precoCentavos como mínimo. */
    precoLivre: integer("preco_livre", { mode: "boolean" }).notNull().default(false),
    destaque: integer("destaque", { mode: "boolean" }).notNull().default(false),
    /** Nulo = ilimitado. */
    estoque: integer("estoque"),
    ordem: integer("ordem").notNull().default(0),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    criadoEm: integer("criado_em").notNull().default(agora),
  },
  (t) => [
    uniqueIndex("idx_produtos_slug").on(t.slug),
    index("idx_produtos_categoria").on(t.categoriaId),
    index("idx_produtos_ativo_ordem").on(t.ativo, t.ordem),
  ],
);

/**
 * Pedidos.
 *
 * `publicId` é um token aleatório usado na URL de pagamento — o `id` sequencial
 * nunca aparece publicamente, senão qualquer um adivinharia o pedido do vizinho.
 */
export const pedidos = sqliteTable(
  "pedidos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    nick: text("nick").notNull(),
    plataforma: text("plataforma", { enum: ["java", "bedrock"] }).notNull().default("java"),
    email: text("email"),
    /** Nulo quando a compra é para o próprio comprador. */
    nickPresenteado: text("nick_presenteado"),
    totalCentavos: integer("total_centavos").notNull(),
    status: text("status", {
      enum: [
        "aguardando_pagamento",
        "pago",
        "em_revisao",
        "entregue",
        "expirado",
        "cancelado",
        "reembolsado",
      ],
    })
      .notNull()
      .default("aguardando_pagamento"),
    provider: text("provider").notNull(),
    providerChargeId: text("provider_charge_id"),
    pixCopiaCola: text("pix_copia_cola"),
    pixQrBase64: text("pix_qr_base64"),
    expiraEm: integer("expira_em"),
    pagoEm: integer("pago_em"),
    entregueEm: integer("entregue_em"),
    entreguePor: text("entregue_por"),
    notaAdmin: text("nota_admin"),
    ip: text("ip"),
    criadoEm: integer("criado_em").notNull().default(agora),
  },
  (t) => [
    uniqueIndex("idx_pedidos_public_id").on(t.publicId),
    index("idx_pedidos_status_criado").on(t.status, t.criadoEm),
    index("idx_pedidos_charge").on(t.providerChargeId),
    index("idx_pedidos_nick").on(t.nick),
  ],
);

/**
 * Snapshot imutável do produto no momento da compra.
 *
 * Repetir nome e preço aqui é proposital: mudar o preço de um produto amanhã
 * não pode reescrever o histórico de vendas de ontem.
 */
export const pedidoItens = sqliteTable(
  "pedido_itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pedidoId: integer("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    produtoId: integer("produto_id").notNull(),
    nome: text("nome").notNull(),
    precoCentavos: integer("preco_centavos").notNull(),
    quantidade: integer("quantidade").notNull(),
    imagemKey: text("imagem_key"),
  },
  (t) => [index("idx_pedido_itens_pedido").on(t.pedidoId)],
);

/**
 * Eventos de webhook já processados.
 *
 * O `eventoId` UNIQUE é o que garante idempotência: o Mercado Pago reenvia
 * webhooks, e sem isto o mesmo pedido seria marcado como pago duas vezes.
 */
export const webhookEventos = sqliteTable(
  "webhook_eventos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    eventoId: text("evento_id").notNull(),
    tipo: text("tipo"),
    payload: text("payload"),
    recebidoEm: integer("recebido_em").notNull().default(agora),
  },
  (t) => [uniqueIndex("idx_webhook_evento_unico").on(t.provider, t.eventoId)],
);

/** Usuários do painel administrativo. Senha com PBKDF2 via WebCrypto. */
export const adminUsuarios = sqliteTable(
  "admin_usuarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    senhaHash: text("senha_hash").notNull(),
    nome: text("nome"),
    ultimoLogin: integer("ultimo_login"),
    criadoEm: integer("criado_em").notNull().default(agora),
  },
  (t) => [uniqueIndex("idx_admin_email").on(t.email)],
);

/** Configuração editável da loja (chave/valor), para o dono não precisar de deploy. */
export const config = sqliteTable("config", {
  chave: text("chave").primaryKey(),
  valor: text("valor"),
  atualizadoEm: integer("atualizado_em").notNull().default(agora),
});
