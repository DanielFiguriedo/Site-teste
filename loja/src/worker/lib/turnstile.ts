import type { Env } from "../env";
import { badRequest } from "./errors";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Validates a Turnstile token.
 *
 * Without it a script could create thousands of Pix charges per minute, which
 * pollutes the gateway dashboard and can get the account suspended. The check
 * only runs when the secret is configured, so local development stays usable
 * without a widget.
 */
export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  ip: string | undefined,
): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) return;

  if (!token) throw badRequest("Confirme que você não é um robô.");

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const response = await fetch(VERIFY_URL, { method: "POST", body: form });

  // Fails closed. An unreadable answer from the verifier is not a pass: the
  // whole point of this check is that it cannot be skipped by making it fail.
  const result = (await response.json().catch(() => null)) as { success?: boolean } | null;

  if (!response.ok || !result?.success) {
    throw badRequest("Verificação anti-robô falhou. Recarregue a página e tente de novo.");
  }
}
