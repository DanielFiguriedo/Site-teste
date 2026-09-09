import { describe, expect, it } from "vitest";
import { ehEventoDuplicado } from "./webhook";

/**
 * Distinguir "evento repetido" de "o banco falhou" é o que decide se o gateway
 * reenvia ou desiste. Tratar uma falha de infraestrutura como duplicata faz o
 * Mercado Pago parar de reenviar um evento que nunca foi processado — ou seja,
 * um pagamento perdido.
 */
describe("ehEventoDuplicado", () => {
  it("reconhece o erro do D1 embrulhado pelo Drizzle", () => {
    // Formato real: o `message` do Drizzle não cita o UNIQUE; só o `cause` cita.
    const doD1 = new Error(
      "D1_ERROR: UNIQUE constraint failed: webhook_eventos.provider, " +
        "webhook_eventos.evento_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)",
    );
    const doDrizzle = new Error('Failed query: insert into "webhook_eventos" ...', {
      cause: doD1,
    });

    expect(ehEventoDuplicado(doDrizzle)).toBe(true);
  });

  it("reconhece o erro cru, sem embrulho", () => {
    expect(ehEventoDuplicado(new Error("UNIQUE constraint failed: x.y"))).toBe(true);
  });

  it("NÃO trata falha de infraestrutura como duplicata", () => {
    expect(ehEventoDuplicado(new Error("Network connection lost."))).toBe(false);
    expect(ehEventoDuplicado(new Error("D1_ERROR: no such table: webhook_eventos"))).toBe(false);
    expect(ehEventoDuplicado(new Error("Failed query: insert into ..."))).toBe(false);
    expect(ehEventoDuplicado(undefined)).toBe(false);
  });

  it("não entra em laço infinito com causas circulares", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b", { cause: a });
    a.cause = b;
    expect(ehEventoDuplicado(a)).toBe(false);
  });
});
