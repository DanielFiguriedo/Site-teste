import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client";
import {
  findAdminByEmail,
  verifyPassword,
  createSession,
  destroySession,
  requireAdmin,
} from "../../lib/auth";
import { unauthorized, badRequest } from "../../lib/errors";
import type { AppEnv } from "../../env";

export const adminSession = new Hono<AppEnv>();

const loginSchema = z.object({
  email: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(200),
});

/** Fixed delay on a failed login, to discourage bulk guessing. */
const FAILURE_DELAY_MS = 400;

adminSession.post("/admin/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Informe e-mail e senha.");

  const { email, password } = parsed.data;
  const user = await findAdminByEmail(c.env, email);

  // Same message for an unknown e-mail and a wrong password: telling them apart
  // would hand over the list of valid e-mails for free.
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    throw unauthorized("E-mail ou senha incorretos.");
  }

  await createSession(c, user);
  await db(c.env)
    .update(schema.adminUsers)
    .set({ lastLoginAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.adminUsers.id, user.id));

  return c.json({ email: user.email, name: user.name });
});

adminSession.post("/admin/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

/** Used by the front-end to know whether a valid session still exists. */
adminSession.get("/admin/me", requireAdmin, (c) =>
  c.json({ id: c.get("adminId"), email: c.get("adminEmail") }),
);
