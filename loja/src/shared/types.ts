/**
 * Tipos compartilhados entre o Worker e o front-end.
 *
 * Regra que atravessa todo o sistema: dinheiro é sempre inteiro em CENTAVOS.
 * Nunca float — arredondamento de ponto flutuante em dinheiro é a origem
 * clássica de divergência entre o total do site e o extrato do gateway.
 */

export type Centavos = number;

export const STATUS_PEDIDO = [
  "aguardando_pagamento",
  "pago",
  "entregue",
  "expirado",
  "cancelado",
  "reembolsado",
] as const;

export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export type Plataforma = "java" | "bedrock";

export interface Categoria {
  id: number;
  slug: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  ordem: number;
}

export interface Produto {
  id: number;
  categoriaId: number;
  categoriaSlug: string;
  categoriaNome: string;
  slug: string;
  nome: string;
  descricaoCurta: string | null;
  descricaoMd: string | null;
  precoCentavos: Centavos;
  /** Preço "de" (riscado). Nulo quando não há promoção. */
  precoDeCentavos: Centavos | null;
  /** ISO 8601. Nulo quando a promoção não expira. */
  promocaoExpiraEm: string | null;
  /** Nulo = permanente. Usado nos VIPs por tempo. */
  duracaoDias: number | null;
  imagemUrl: string | null;
  presenteavel: boolean;
  /** Produto de doação: o comprador escolhe o valor (>= precoCentavos). */
  precoLivre: boolean;
  destaque: boolean;
  /** Nulo = estoque ilimitado. */
  estoque: number | null;
}

export interface ItemPedido {
  produtoId: number;
  nome: string;
  precoCentavos: Centavos;
  quantidade: number;
  imagemUrl: string | null;
}

export interface Pedido {
  publicId: string;
  nick: string;
  plataforma: Plataforma;
  nickPresenteado: string | null;
  status: StatusPedido;
  totalCentavos: Centavos;
  itens: ItemPedido[];
  pixCopiaCola: string | null;
  pixQrBase64: string | null;
  /** ISO 8601 */
  expiraEm: string | null;
  criadoEm: string;
  pagoEm: string | null;
  entregueEm: string | null;
}

export interface ConfigLoja {
  nomeServidor: string;
  ipServidor: string | null;
  logoUrl: string | null;
  discordConvite: string | null;
  /** Texto curto: "em até 24 horas", usado nas telas de pagamento e sucesso. */
  prazoEntrega: string;
  avisoEntrega: string;
  /** Conteúdo em markdown das páginas legais, editável no painel. */
  termosMd: string | null;
  reembolsoMd: string | null;
}

/** Envelope de erro devolvido por toda a API. */
export interface ApiErro {
  erro: string;
  detalhes?: unknown;
}
