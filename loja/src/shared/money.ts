import type { Cents } from "./types";

/** Formats cents as Brazilian currency: 2990 -> "R$ 29,90". */
export function formatBRL(cents: Cents): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** Converts cents to the decimal the gateway expects: 2990 -> 29.9 */
export function centsToReais(cents: Cents): number {
  return Math.round(cents) / 100;
}

/** Whole-number discount between the original price and the current one. */
export function discountPercent(original: Cents, current: Cents): number {
  if (original <= 0 || current >= original) return 0;
  return Math.round(((original - current) / original) * 100);
}
