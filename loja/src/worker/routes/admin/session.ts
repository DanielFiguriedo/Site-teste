import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client";
import {
  findAdminByEmail,
  verifyPassword,
  verifyAgainstMissingUser,
  createSession,
  destroySession,
} from "../../lib/auth";
import { clearFailures, isRateLimited, registerFailure } from "../../lib/rate-limit";
import { unauthorized, badRequest, ApiError } from "../../lib/errors";
import type { AppEnv } from "../../env";

export const adminSession = new Hono<AppEnv>();

const loginSchema = z.object({
  email: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(200),
});

/** Fixed delay on a failed login, to discourage bulk guessing. */
const FAILURE_DELAY_MS = 400;

/**
 * Failed logins tolerated in a 15-minute sliding window.
 *
 * Three buckets, because they stop different things:
 *
 * - **account** is the e-mail *and* the address it is being guessed from. A
 *   bucket keyed on the e-mail alone would hand any stranger a way to lock the
 *   owner out of the panel with six requests — the e-mail is not a secret, and
 *   an owner who cannot reach the panel cannot deliver the orders people paid
 *   for. That denial of service is the worse outcome of the two.
 * - **ip** stops one address spraying a password across many accounts, and caps
 *   how much PBKDF2 a single caller can make the Worker spend.
 * - **spread** counts failures against one e-mail from everywhere. It never
 *   denies a request — it only slows every attempt on that e-mail down, so a
 *   guess distributed across hundreds of addresses becomes expensive while the
 *   owner, who types the right password, still gets in.
 */
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 15;
const SUSPICIOUS_SPREAD = 20;
/** Extra delay once one e-mail is being guessed from many addresses. */
const SPREAD_DELAY_MS = 1500;
const WINDOW_SECONDS = 15 * 60;

adminSession.post("/admin/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Informe e-mail e senha.");

  const { email, password } = parsed.data;
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const accountScope = `login:account:${email.toLowerCase()}:${ip}`;
  const ipScope = `login:ip:${ip}`;
  const spreadScope = `login:email:${email.toLowerCase()}`;

  if (
    (await isRateLimited(c.env, accountScope, MAX_FAILURES_PER_ACCOUNT)) ||
    (await isRateLimited(c.env, ipScope, MAX_FAILURES_PER_IP))
  ) {
    throw new ApiError(429, "Tentativas demais. Aguarde 15 minutos e tente de novo.");
  }

  // Never a refusal, only a cost: this is the one bucket an attacker can fill
  // for someone else's e-mail.
  if (await isRateLimited(c.env, spreadScope, SUSPICIOUS_SPREAD)) {
    await new Promise((resolve) => setTimeout(resolve, SPREAD_DELAY_MS));
  }

  const user = await findAdminByEmail(c.env, email);

  // Same message for an unknown e-mail and a wrong password, and — just as
  // important — the same amount of work, so the two cannot be told apart by how
  // long the answer takes.
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyAgainstMissingUser(password);

  if (!user || !passwordOk) {
    await registerFailure(c.env, accountScope, WINDOW_SECONDS);
    await registerFailure(c.env, ipScope, WINDOW_SECONDS);
    await registerFailure(c.env, spreadScope, WINDOW_SECONDS);
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    throw unauthorized("E-mail ou senha incorretos.");
  }

  // Whoever typed the right password is the owner, not the attacker: their own
  // counters go back to zero, including the shared one that adds the delay.
  await clearFailures(c.env, accountScope);
  await clearFailures(c.env, ipScope);
  await clearFailures(c.env, spreadScope);

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
adminSession.get("/admin/me", (c) =>
  c.json({ id: c.get("adminId"), email: c.get("adminEmail") }),
);
