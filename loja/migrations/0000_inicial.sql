CREATE TABLE `admin_usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`senha_hash` text NOT NULL,
	`nome` text,
	`ultimo_login` integer,
	`criado_em` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_email` ON `admin_usuarios` (`email`);--> statement-breakpoint
CREATE TABLE `categorias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`slug` text NOT NULL,
	`nome` text NOT NULL,
	`descricao` text,
	`icone` text,
	`ordem` integer DEFAULT 0 NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categorias_slug` ON `categorias` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_categorias_ordem` ON `categorias` (`ordem`);--> statement-breakpoint
CREATE TABLE `config` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text,
	`atualizado_em` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pedido_itens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pedido_id` integer NOT NULL,
	`produto_id` integer NOT NULL,
	`nome` text NOT NULL,
	`preco_centavos` integer NOT NULL,
	`quantidade` integer NOT NULL,
	`imagem_key` text,
	FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pedido_itens_pedido` ON `pedido_itens` (`pedido_id`);--> statement-breakpoint
CREATE TABLE `pedidos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`nick` text NOT NULL,
	`plataforma` text DEFAULT 'java' NOT NULL,
	`email` text,
	`nick_presenteado` text,
	`total_centavos` integer NOT NULL,
	`status` text DEFAULT 'aguardando_pagamento' NOT NULL,
	`provider` text NOT NULL,
	`provider_charge_id` text,
	`pix_copia_cola` text,
	`pix_qr_base64` text,
	`expira_em` integer,
	`pago_em` integer,
	`entregue_em` integer,
	`entregue_por` text,
	`nota_admin` text,
	`ip` text,
	`criado_em` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pedidos_public_id` ON `pedidos` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_pedidos_status_criado` ON `pedidos` (`status`,`criado_em`);--> statement-breakpoint
CREATE INDEX `idx_pedidos_charge` ON `pedidos` (`provider_charge_id`);--> statement-breakpoint
CREATE INDEX `idx_pedidos_nick` ON `pedidos` (`nick`);--> statement-breakpoint
CREATE TABLE `produtos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoria_id` integer NOT NULL,
	`slug` text NOT NULL,
	`nome` text NOT NULL,
	`descricao_curta` text,
	`descricao_md` text,
	`preco_centavos` integer NOT NULL,
	`preco_de_centavos` integer,
	`promocao_expira_em` integer,
	`duracao_dias` integer,
	`imagem_key` text,
	`presenteavel` integer DEFAULT true NOT NULL,
	`preco_livre` integer DEFAULT false NOT NULL,
	`destaque` integer DEFAULT false NOT NULL,
	`estoque` integer,
	`ordem` integer DEFAULT 0 NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_produtos_slug` ON `produtos` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_produtos_categoria` ON `produtos` (`categoria_id`);--> statement-breakpoint
CREATE INDEX `idx_produtos_ativo_ordem` ON `produtos` (`ativo`,`ordem`);--> statement-breakpoint
CREATE TABLE `webhook_eventos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`evento_id` text NOT NULL,
	`tipo` text,
	`payload` text,
	`recebido_em` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_webhook_evento_unico` ON `webhook_eventos` (`provider`,`evento_id`);