#!/usr/bin/env node
/**
 * Gera o comando SQL que cria (ou atualiza) um usuário do painel.
 *
 * A senha é transformada em hash aqui, na sua máquina — ela nunca é digitada
 * num formulário público nem trafega pela rede. O hash usa exatamente os mesmos
 * parâmetros do `src/worker/lib/auth.ts` (PBKDF2-SHA256, 100.000 iterações,
 * salt de 16 bytes, chave de 32 bytes), porque é o Worker que vai conferi-lo.
 *
 * Uso:
 *   node scripts/criar-admin.mjs dono@exemplo.com "senha-forte-aqui"
 *
 * Depois, aplique o SQL impresso:
 *   npx wrangler d1 execute loja-minecraft --local  --command "<SQL>"
 *   npx wrangler d1 execute loja-minecraft --remote --command "<SQL>"
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERACOES = 100_000;

const [email, senha] = process.argv.slice(2);

if (!email || !senha) {
  console.error('Uso: node scripts/criar-admin.mjs <email> "<senha>"');
  process.exit(1);
}
if (senha.length < 10) {
  console.error("Use uma senha de pelo menos 10 caracteres: este painel dá acesso às vendas.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(senha, salt, ITERACOES, 32, "sha256");
const armazenado = `pbkdf2$${ITERACOES}$${salt.toString("base64")}$${hash.toString("base64")}`;

// Aspas simples dobradas para não quebrar o literal SQL.
const escapar = (v) => v.replace(/'/g, "''");

const sql =
  `INSERT INTO admin_usuarios (email, senha_hash) VALUES ('${escapar(email.toLowerCase().trim())}', '${escapar(armazenado)}') ` +
  `ON CONFLICT(email) DO UPDATE SET senha_hash = excluded.senha_hash;`;

console.log("\nSQL para criar/atualizar o administrador:\n");
console.log(sql);
console.log("\nAplique com:\n");
console.log(`  npx wrangler d1 execute loja-minecraft --local --command "${sql.replace(/"/g, '\\"')}"`);
console.log("");
