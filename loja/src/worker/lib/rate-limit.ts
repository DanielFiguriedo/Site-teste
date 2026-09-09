import type { Env } from "../env";

/**
 * Attempt counter in KV.
 *
 * KV is eventually consistent, so a burst of simultaneous requests can slip a
 * few extra attempts through before the counter catches up. That is acceptable
 * here: the goal is to make an offline-scale password guess impossible, not to
 * meter requests exactly. Anything needing exactness would need Durable Objects
 * and would cost far more than it buys.
 *
 * The TTL is refreshed on every failure, which makes the window sliding: an
 * attacker who keeps trying stays locked out instead of being freed by the
 * clock.
 */

/** KV refuses a TTL below 60 seconds, so no window may be shorter than that. */
const MIN_WINDOW_SECONDS = 60;

export async function isRateLimited(env: Env, scope: string, limit: number): Promise<boolean> {
  const attempts = Number((await env.SESSIONS.get(`ratelimit:${scope}`)) ?? 0);
  return attempts >= limit;
}

export async function registerFailure(
  env: Env,
  scope: string,
  windowSeconds: number,
): Promise<void> {
  const key = `ratelimit:${scope}`;
  const attempts = Number((await env.SESSIONS.get(key)) ?? 0);

  await env.SESSIONS.put(key, String(attempts + 1), {
    expirationTtl: Math.max(MIN_WINDOW_SECONDS, windowSeconds),
  });
}

/** Called on success, so a legitimate login clears the counter it built up. */
export async function clearFailures(env: Env, scope: string): Promise<void> {
  await env.SESSIONS.delete(`ratelimit:${scope}`);
}
