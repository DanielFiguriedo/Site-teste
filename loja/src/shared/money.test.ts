import { describe, expect, it } from "vitest";
import { centsToReais, formatBRL, discountPercent } from "./money";

/**
 * `Intl` separates "R$" from the digits with a non-breaking space, and which
 * one it picks (U+00A0 or U+202F) varies with the ICU version. Normalising here
 * keeps the assertions about the formatting, not about an invisible codepoint.
 */
const normalize = (value: string) => value.replace(/[  ]/g, " ");

describe("formatBRL", () => {
  it("formats cents as Brazilian currency", () => {
    expect(normalize(formatBRL(1990))).toBe("R$ 19,90");
    expect(normalize(formatBRL(0))).toBe("R$ 0,00");
    expect(normalize(formatBRL(100))).toBe("R$ 1,00");
  });

  it("uses a thousands separator", () => {
    expect(normalize(formatBRL(149900))).toBe("R$ 1.499,00");
  });

  it("keeps the comma as the decimal separator", () => {
    expect(normalize(formatBRL(5))).toBe("R$ 0,05");
    expect(normalize(formatBRL(1))).toBe("R$ 0,01");
  });
});

describe("centsToReais", () => {
  it("converts to the decimal the gateway expects", () => {
    expect(centsToReais(1990)).toBe(19.9);
    expect(centsToReais(5)).toBe(0.05);
  });

  it("does not lose a cent on values that break in floating point", () => {
    // 0.1 + 0.2 !== 0.3 in float; working in cents is precisely what keeps the
    // total from drifting away from the gateway statement.
    expect(centsToReais(10) + centsToReais(20)).toBeCloseTo(0.3, 10);
    expect(centsToReais(3333)).toBe(33.33);
  });

  it("rounds a non-integer input instead of passing fractions of a cent on", () => {
    expect(centsToReais(1990.4)).toBe(19.9);
  });
});

describe("discountPercent", () => {
  it("rounds the discount to a whole percentage", () => {
    expect(discountPercent(3490, 1990)).toBe(43);
    expect(discountPercent(2000, 1000)).toBe(50);
  });

  it("returns zero when there is no real sale", () => {
    expect(discountPercent(1000, 1000)).toBe(0);
    expect(discountPercent(1000, 2000)).toBe(0);
    expect(discountPercent(0, 1000)).toBe(0);
    expect(discountPercent(-100, 50)).toBe(0);
  });
});
