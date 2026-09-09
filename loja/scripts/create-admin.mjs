#!/usr/bin/env node
/**
 * Prints the SQL command that creates (or updates) an admin panel user.
 *
 * The password is hashed here, on your machine — it is never typed into a public
 * form nor sent over the wire. The hash uses exactly the same parameters as
 * `src/worker/lib/auth.ts` (PBKDF2-SHA256, 100,000 iterations, 16-byte salt,
 * 32-byte key), because the Worker is what verifies it.
 *
 * Usage:
 *   node scripts/create-admin.mjs owner@example.com "a-strong-password"
 *
 * Then apply the printed SQL:
 *   npx wrangler d1 execute loja-minecraft --local  --command "<SQL>"
 *   npx wrangler d1 execute loja-minecraft --remote --command "<SQL>"
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 100_000;

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.mjs <email> "<password>"');
  process.exit(1);
}
if (password.length < 10) {
  console.error("Use a password of at least 10 characters: this panel controls the sales.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const stored = `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;

// Single quotes are doubled so they do not break the SQL literal.
const escape = (value) => value.replace(/'/g, "''");

const sql =
  `INSERT INTO admin_users (email, password_hash) VALUES ('${escape(email.toLowerCase().trim())}', '${escape(stored)}') ` +
  `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash;`;

console.log("\nSQL to create/update the administrator:\n");
console.log(sql);
console.log("\nApply it with:\n");
console.log(`  npx wrangler d1 execute loja-minecraft --local --command "${sql.replace(/"/g, '\\"')}"`);
console.log("");
