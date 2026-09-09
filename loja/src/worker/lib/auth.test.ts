import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { conferirSenha, gerarHashSenha } from "./auth";

describe("senha do painel", () => {
  it("confere a senha correta e recusa a errada", async () => {
    const hash = await gerarHashSenha("senha-bem-longa-123");
    expect(await conferirSenha("senha-bem-longa-123", hash)).toBe(true);
    expect(await conferirSenha("senha-bem-longa-124", hash)).toBe(false);
    expect(await conferirSenha("", hash)).toBe(false);
  });

  it("usa salt novo a cada chamada", async () => {
    // Hashes iguais para senhas iguais entregariam de graça quem repete senha.
    const a = await gerarHashSenha("mesma-senha-aqui");
    const b = await gerarHashSenha("mesma-senha-aqui");
    expect(a).not.toBe(b);
    expect(await conferirSenha("mesma-senha-aqui", b)).toBe(true);
  });

  it("recusa um hash em formato desconhecido em vez de estourar", async () => {
    expect(await conferirSenha("x", "md5$abc")).toBe(false);
    expect(await conferirSenha("x", "lixo")).toBe(false);
  });

  /**
   * O hash é gerado por um script Node (`scripts/criar-admin.mjs`) e conferido
   * pelo Worker com WebCrypto. Se os parâmetros divergirem, o dono cria a senha
   * e simplesmente não consegue entrar — este teste tranca os dois lados juntos.
   */
  it("aceita o hash produzido pelo script criar-admin.mjs", async () => {
    const saida = execFileSync(
      process.execPath,
      ["scripts/criar-admin.mjs", "dono@exemplo.com", "senha-do-script-123"],
      { encoding: "utf8" },
    );

    const hash = saida.match(/'(pbkdf2\$[^']+)'/)?.[1];
    expect(hash).toBeDefined();
    expect(await conferirSenha("senha-do-script-123", hash!)).toBe(true);
    expect(await conferirSenha("outra-senha", hash!)).toBe(false);
  });
});
