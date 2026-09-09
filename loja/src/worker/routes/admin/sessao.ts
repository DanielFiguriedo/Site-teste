import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client";
import {
  buscarAdminPorEmail,
  conferirSenha,
  criarSessao,
  encerrarSessao,
  exigirAdmin,
} from "../../lib/auth";
import { naoAutorizado, requisicaoInvalida } from "../../lib/erros";
import type { AppEnv } from "../../env";

export const sessaoAdmin = new Hono<AppEnv>();

const schemaLogin = z.object({
  email: z.string().trim().min(3).max(160),
  senha: z.string().min(1).max(200),
});

/** Atraso fixo em falha de login, para desestimular tentativa em massa. */
const ATRASO_FALHA_MS = 400;

sessaoAdmin.post("/admin/login", async (c) => {
  const analise = schemaLogin.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) throw requisicaoInvalida("Informe e-mail e senha.");

  const { email, senha } = analise.data;
  const usuario = await buscarAdminPorEmail(c.env, email);

  // Mesma mensagem para e-mail inexistente e senha errada: distinguir os dois
  // entregaria de graça a lista de e-mails válidos.
  const senhaOk = usuario ? await conferirSenha(senha, usuario.senhaHash) : false;

  if (!usuario || !senhaOk) {
    await new Promise((r) => setTimeout(r, ATRASO_FALHA_MS));
    throw naoAutorizado("E-mail ou senha incorretos.");
  }

  await criarSessao(c, usuario);
  await db(c.env)
    .update(schema.adminUsuarios)
    .set({ ultimoLogin: Math.floor(Date.now() / 1000) })
    .where(eq(schema.adminUsuarios.id, usuario.id));

  return c.json({ email: usuario.email, nome: usuario.nome });
});

sessaoAdmin.post("/admin/logout", async (c) => {
  await encerrarSessao(c);
  return c.json({ ok: true });
});

/** Usado pelo front para saber se ainda há sessão válida ao abrir o painel. */
sessaoAdmin.get("/admin/eu", exigirAdmin, (c) =>
  c.json({ id: c.get("adminId"), email: c.get("adminEmail") }),
);
