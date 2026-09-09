import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Os testes cobrem a lógica pura e crítica — dinheiro, máquina de estados e
 * criptografia. Rodam em Node puro (sem o `workerd`) porque tudo que testam usa
 * apenas WebCrypto, que o Node também expõe em `globalThis.crypto`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "./src/shared"),
    },
  },
});
