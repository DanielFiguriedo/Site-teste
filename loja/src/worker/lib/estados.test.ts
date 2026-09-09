import { describe, expect, it } from "vitest";
import { transicaoValida } from "./pedidos";
import { gerarSlug } from "./slug";
import { STATUS_PEDIDO } from "@shared/types";

describe("máquina de estados do pedido", () => {
  it("segue o caminho feliz: aguardando -> pago -> entregue", () => {
    expect(transicaoValida("aguardando_pagamento", "pago")).toBe(true);
    expect(transicaoValida("pago", "entregue")).toBe(true);
  });

  it("impede entregar o mesmo pedido duas vezes", () => {
    expect(transicaoValida("entregue", "entregue")).toBe(false);
  });

  it("impede um pedido entregue voltar para pago", () => {
    expect(transicaoValida("entregue", "pago")).toBe(false);
  });

  it("impede pagar um pedido que já expirou ou foi cancelado", () => {
    expect(transicaoValida("expirado", "pago")).toBe(false);
    expect(transicaoValida("cancelado", "pago")).toBe(false);
  });

  it("permite reembolsar tanto o pago quanto o entregue", () => {
    expect(transicaoValida("pago", "reembolsado")).toBe(true);
    expect(transicaoValida("entregue", "reembolsado")).toBe(true);
  });

  it("trata reembolsado e cancelado como finais", () => {
    for (const destino of STATUS_PEDIDO) {
      expect(transicaoValida("reembolsado", destino)).toBe(false);
      expect(transicaoValida("cancelado", destino)).toBe(false);
    }
  });

  it("deixa um pedido expirado ir para revisão, e só para lá", () => {
    // Um Pix pode cair depois do QR vencer. Sem esta saída, o pagamento seria
    // absorvido em silêncio e nem o admin conseguiria corrigir.
    expect(transicaoValida("expirado", "em_revisao")).toBe(true);
    for (const destino of STATUS_PEDIDO) {
      if (destino === "em_revisao") continue;
      expect(transicaoValida("expirado", destino)).toBe(false);
    }
  });

  it("permite resolver a revisão liberando ou encerrando o pedido", () => {
    expect(transicaoValida("em_revisao", "pago")).toBe(true);
    expect(transicaoValida("em_revisao", "cancelado")).toBe(true);
    expect(transicaoValida("em_revisao", "reembolsado")).toBe(true);
    // Nunca direto para entregue: a revisão existe para alguém conferir antes.
    expect(transicaoValida("em_revisao", "entregue")).toBe(false);
  });

  it("nunca deixa um estado transitar para ele mesmo", () => {
    for (const status of STATUS_PEDIDO) {
      expect(transicaoValida(status, status)).toBe(false);
    }
  });
});

describe("gerarSlug", () => {
  it("remove acento em vez de trocá-lo por separador", () => {
    // Sem o passo de NFD + remoção de marcas, "AÇÃO" viraria "a-a-o".
    expect(gerarSlug("CHAVE MÍSTICA [x5]")).toBe("chave-mistica-x5");
    expect(gerarSlug("AÇÃO")).toBe("acao");
    expect(gerarSlug("VIP OURO [30 DIAS]")).toBe("vip-ouro-30-dias");
  });

  it("não deixa separador sobrando nas pontas", () => {
    expect(gerarSlug("  [Kit]  ")).toBe("kit");
    expect(gerarSlug("!!!")).toBe("");
  });
});
