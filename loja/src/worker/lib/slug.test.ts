import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("strips accents instead of turning them into separators", () => {
    // Without the NFD + combining-mark removal, "AÇÃO" would become "a-a-o".
    expect(slugify("CHAVE MÍSTICA [x5]")).toBe("chave-mistica-x5");
    expect(slugify("AÇÃO")).toBe("acao");
    expect(slugify("VIP OURO [30 DIAS]")).toBe("vip-ouro-30-dias");
  });

  it("leaves no separator dangling at either end", () => {
    expect(slugify("  [Kit]  ")).toBe("kit");
    expect(slugify("!!!")).toBe("");
  });

  it("collapses runs of invalid characters into a single separator", () => {
    expect(slugify("CASH  ///  1.000")).toBe("cash-1-000");
  });

  it("caps the length so it always fits the column", () => {
    expect(slugify("a".repeat(200))).toHaveLength(100);
  });
});
