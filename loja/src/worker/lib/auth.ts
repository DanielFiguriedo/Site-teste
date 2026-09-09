import { eq } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { db, schema } from "../db/client";
import { naoAutorizado } from "./erros";
import { comparaSegura } from "../payments/provider";
import type { AppEnv, Env } from "../env";

const COOKIE = "loja_admin";
/** Duração da sessão. Curta o bastante para um notebook esquecido não virar risco. */
const DURACAO_SEGUNDOS = 60 * 60 * 12;
const ITERACOES = 100_000;

const b64 = {
  codificar: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decodificar: (texto: string) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0)),
};

/**
 * Hash de senha com PBKDF2-SHA256 via WebCrypto — `node:crypto` não existe no
 * runtime do Workers. Formato: `pbkdf2$<iteracoes>$<salt>$<hash>`, ambos base64.
 */
export async function gerarHashSenha(senha: string, saltBruto?: Uint8Array): Promise<string> {
  const salt = saltBruto ?? crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERACOES, hash: "SHA-256" },
    chave,
    256,
  );
  return `pbkdf2$${ITERACOES}$${b64.codificar(salt)}$${b64.codificar(new Uint8Array(bits))}`;
}

export async function conferirSenha(senha: string, armazenado: string): Promise<boolean> {
  const [algoritmo, iteracoes, salt, hash] = armazenado.split("$");
  if (algoritmo !== "pbkdf2" || !salt || !hash) return false;

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: b64.decodificar(salt),
      iterations: Number(iteracoes),
      hash: "SHA-256",
    },
    chave,
    256,
  );
  return comparaSegura(b64.codificar(new Uint8Array(bits)), hash);
}

/** Assina `<payload>.<hmac>`, no formato do cookie de sessão. */
async function assinar(env: Env, payload: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  return `${payload}.${b64.codificar(new Uint8Array(assinatura))}`;
}

interface Sessao {
  sid: string;
  id: number;
  email: string;
  exp: number;
}

export async function criarSessao(c: Context<AppEnv>, usuario: { id: number; email: string }) {
  const sessao: Sessao = {
    sid: crypto.randomUUID(),
    id: usuario.id,
    email: usuario.email,
    exp: Math.floor(Date.now() / 1000) + DURACAO_SEGUNDOS,
  };

  const payload = b64.codificar(new TextEncoder().encode(JSON.stringify(sessao)));
  const token = await assinar(c.env, payload);

  // O KV guarda apenas as sessões VÁLIDAS. Assim, "sair" revoga de verdade, em
  // vez de só apagar o cookie do navegador de quem saiu.
  await c.env.SESSIONS.put(`sessao:${sessao.sid}`, String(usuario.id), {
    expirationTtl: DURACAO_SEGUNDOS,
  });

  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: c.env.AMBIENTE === "producao",
    sameSite: "Strict",
    path: "/",
    maxAge: DURACAO_SEGUNDOS,
  });
}

export async function encerrarSessao(c: Context<AppEnv>) {
  const token = getCookie(c, COOKIE);
  if (token) {
    const sessao = await validarToken(c.env, token);
    if (sessao) await c.env.SESSIONS.delete(`sessao:${sessao.sid}`);
  }
  deleteCookie(c, COOKIE, { path: "/" });
}

async function validarToken(env: Env, token: string): Promise<Sessao | null> {
  const separador = token.lastIndexOf(".");
  if (separador < 0) return null;

  const payload = token.slice(0, separador);
  if (!comparaSegura(await assinar(env, payload), token)) return null;

  try {
    const sessao = JSON.parse(new TextDecoder().decode(b64.decodificar(payload))) as Sessao;
    if (sessao.exp < Math.floor(Date.now() / 1000)) return null;
    return sessao;
  } catch {
    return null;
  }
}

/** Middleware das rotas `/api/admin/*`. */
export async function exigirAdmin(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, COOKIE);
  if (!token) throw naoAutorizado("Faça login para continuar.");

  const sessao = await validarToken(c.env, token);
  if (!sessao) throw naoAutorizado("Sessão inválida ou expirada.");

  // A assinatura prova que o cookie não foi forjado; o KV prova que a sessão
  // ainda não foi revogada.
  if (!(await c.env.SESSIONS.get(`sessao:${sessao.sid}`))) {
    throw naoAutorizado("Sessão encerrada. Faça login de novo.");
  }

  c.set("adminId", sessao.id);
  c.set("adminEmail", sessao.email);
  await next();
}

export async function buscarAdminPorEmail(env: Env, email: string) {
  const [usuario] = await db(env)
    .select()
    .from(schema.adminUsuarios)
    .where(eq(schema.adminUsuarios.email, email.toLowerCase().trim()))
    .limit(1);
  return usuario;
}
