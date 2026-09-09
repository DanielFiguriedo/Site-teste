import { describe, expect, it } from "vitest";
import { centavosParaReais, formatarBRL, percentualDesconto } from "./dinheiro";

describe("formatarBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    //   é o espaço fixo que o Intl coloca depois de "R$".
    expect(formatarBRL(1990)).toBe("R$ 19,90");
    expect(formatarBRL(0)).toBe("R$ 0,00");
    expect(formatarBRL(100)).toBe("R$ 1,00");
  });

  it("usa separador de milhar", () => {
    expect(formatarBRL(149900)).toBe("R$ 1.499,00");
  });
});

describe("centavosParaReais", () => {
  it("converte para o decimal que o gateway espera", () => {
    expect(centavosParaReais(1990)).toBe(19.9);
    expect(centavosParaReais(5)).toBe(0.05);
  });

  it("não perde centavo em valores que quebram em ponto flutuante", () => {
    // 0.1 + 0.2 !== 0.3 em float; trabalhar em centavos é justamente o que
    // evita esse tipo de divergência com o extrato do gateway.
    expect(centavosParaReais(10) + centavosParaReais(20)).toBeCloseTo(0.3, 10);
    expect(centavosParaReais(3333)).toBe(33.33);
  });
});

describe("percentualDesconto", () => {
  it("calcula o desconto arredondado", () => {
    expect(percentualDesconto(3490, 1990)).toBe(43);
    expect(percentualDesconto(2000, 1000)).toBe(50);
  });

  it("devolve zero quando não há promoção de verdade", () => {
    expect(percentualDesconto(1000, 1000)).toBe(0);
    expect(percentualDesconto(1000, 2000)).toBe(0);
    expect(percentualDesconto(0, 1000)).toBe(0);
  });
});
