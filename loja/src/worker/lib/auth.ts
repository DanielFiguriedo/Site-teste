import { eq } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { db, schema } from "../db/client";
import { unauthorized } from "./errors";
import { timingSafeEqual } from "../payments/provider";
import type { AppEnv, Env } from "../env";

/** Session lifetime. Short enough that a forgotten laptop is not a liability. */
const DURATION_SECONDS = 60 * 60 * 12;
const ITERATIONS = 100_000;

/**
 * Session cookie name.
 *
 * The `__Host-` prefix makes the browser refuse the cookie unless it is
 * `Secure`, `Path=/` and carries no `Domain` — which is what stops a sibling
 * subdomain from planting a session cookie for the store. The prefix requires
 * HTTPS, so development, served over plain http, uses the bare name.
 */
function cookieName(env: Env): string {
  return env.ENVIRONMENT === "production" ? "__Host-store_admin" : "store_admin";
}

const b64 = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decode: (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
};

/**
 * Password hashing with PBKDF2-SHA256 through WebCrypto — `node:crypto` does
 * not exist in the Workers runtime. Format: `pbkdf2$<iterations>$<salt>$<hash>`,
 * both base64.
 */
export async function hashPassword(password: string, rawSalt?: Uint8Array): Promise<string> {
  const salt = rawSalt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${ITERATIONS}$${b64.encode(salt)}$${b64.encode(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterations, salt, hash] = stored.split("$");
  if (algorithm !== "pbkdf2" || !salt || !hash) return false;

  // A stored hash claiming fewer rounds than this code ever writes is corrupt
  // or tampered with. Honouring it would make the check cheap enough to brute
  // force offline, so it is refused rather than trusted.
  const rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < ITERATIONS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: b64.decode(salt), iterations: rounds, hash: "SHA-256" },
    key,
    256,
  );
  return timingSafeEqual(b64.encode(new Uint8Array(bits)), hash);
}

/**
 * Spends the same work as a real verification, then fails.
 *
 * Returning early when the e-mail is unknown answers in about a millisecond
 * while a known e-mail takes the ~100 ms of PBKDF2 — which enumerates the valid
 * admin addresses no matter how identical the response body looks.
 */
export async function verifyAgainstMissingUser(password: string): Promise<false> {
  await hashPassword(password);
  return false;
}

/** Signs `<payload>.<hmac>`, the session cookie format. */
async function sign(env: Env, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${b64.encode(new Uint8Array(signature))}`;
}

interface Session {
  sid: string;
  id: number;
  email: string;
  exp: number;
}

export async function createSession(c: Context<AppEnv>, user: { id: number; email: string }) {
  const session: Session = {
    sid: crypto.randomUUID(),
    id: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + DURATION_SECONDS,
  };

  const payload = b64.encode(new TextEncoder().encode(JSON.stringify(session)));
  const token = await sign(c.env, payload);

  // KV holds only the VALID sessions. That is what makes "sign out" actually
  // revoke access instead of merely clearing the cookie on one browser.
  await c.env.SESSIONS.put(`session:${session.sid}`, String(user.id), {
    expirationTtl: DURATION_SECONDS,
  });

  setCookie(c, cookieName(c.env), token, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === "production",
    sameSite: "Strict",
    path: "/",
    maxAge: DURATION_SECONDS,
  });
}

export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, cookieName(c.env));
  if (token) {
    const session = await verifyToken(c.env, token);
    if (session) await c.env.SESSIONS.delete(`session:${session.sid}`);
  }
  // The `__Host-` prefix has to be honoured when clearing the cookie too: a
  // Set-Cookie with that prefix and no `Secure` is refused outright — Hono
  // throws, and the browser would keep the cookie the logout claimed to remove.
  deleteCookie(c, cookieName(c.env), {
    path: "/",
    secure: c.env.ENVIRONMENT === "production",
  });
}

async function verifyToken(env: Env, token: string): Promise<Session | null> {
  const separator = token.lastIndexOf(".");
  if (separator < 0) return null;

  const payload = token.slice(0, separator);
  if (!timingSafeEqual(await sign(env, payload), token)) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(b64.decode(payload))) as Session;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

/** Middleware for the `/api/admin/*` routes. */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, cookieName(c.env));
  if (!token) throw unauthorized("Faça login para continuar.");

  const session = await verifyToken(c.env, token);
  if (!session) throw unauthorized("Sessão inválida ou expirada.");

  // The signature proves the cookie was not forged; KV proves the session has
  // not been revoked since.
  if (!(await c.env.SESSIONS.get(`session:${session.sid}`))) {
    throw unauthorized("Sessão encerrada. Faça login de novo.");
  }

  c.set("adminId", session.id);
  c.set("adminEmail", session.email);
  await next();
}

export async function findAdminByEmail(env: Env, email: string) {
  const [user] = await db(env)
    .select()
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.email, email.toLowerCase().trim()))
    .limit(1);
  return user;
}
