import type { Centavos } from "./types";

/** Formata centavos como moeda brasileira: 2990 -> "R$ 29,90". */
export function formatarBRL(centavos: Centavos): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

/** Converte centavos para o número decimal que o gateway espera: 2990 -> 29.9 */
export function centavosParaReais(centavos: Centavos): number {
  return Math.round(centavos) / 100;
}

/** Percentual de desconto inteiro entre o preço "de" e o preço atual. */
export function percentualDesconto(de: Centavos, por: Centavos): number {
  if (de <= 0 || por >= de) return 0;
  return Math.round(((de - por) / de) * 100);
}
