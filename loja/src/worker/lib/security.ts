import { secureHeaders } from "hono/secure-headers";
import type { Context, Next } from "hono";
import { ApiError } from "./errors";
import type { AppEnv, Env } from "../env";

/**
 * The store's own public address.
 *
 * `new URL(request.url).origin` is built from the `Host` header, which the
 * caller controls. That address is handed to the payment gateway as the webhook
 * URL and is what the origin check compares against, so pinning it to
 * configuration — when there is one — removes a class of host-header tricks.
 */
export function publicOrigin(env: Env, requestUrl: string): string {
  if (env.PUBLIC_BASE_URL) {
    try {
      return new URL(env.PUBLIC_BASE_URL).origin;
    } catch {
      // A typo in configuration must not take the store offline. Falling back
      // to the request keeps checkout working, and this line says why.
      console.error(`Invalid PUBLIC_BASE_URL: ${env.PUBLIC_BASE_URL}`);
    }
  }
  return new URL(requestUrl).origin;
}

/**
 * Headers on every API response.
 *
 * The static front-end never reaches this middleware — `run_worker_first` sends
 * only `/api/*` through the Worker — so the page's own CSP lives in
 * `public/_headers`. These are the headers for the API and, above all, for the
 * images served out of R2: `nosniff` plus a `default-src 'none'` policy means a
 * file that somehow got past the upload checks still cannot execute anything.
 */
export const apiSecurityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
  },
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  crossOriginResourcePolicy: "same-origin",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  // Noise on a JSON API: legacy headers for plugins this store does not serve.
  xDnsPrefetchControl: false,
  xDownloadOptions: false,
  xPermittedCrossDomainPolicies: false,
  crossOriginEmbedderPolicy: false,
});

/** Responses that must never be written to a cache — they carry buyer data. */
export async function noStore(c: Context<AppEnv>, next: Next) {
  await next();
  c.res.headers.set("cache-control", "no-store");
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Paths authenticated by a cryptographic signature instead of by the browser.
 * The gateway calls the webhook server-to-server and sends no `Origin` at all.
 */
const SIGNED_ENDPOINTS = new Set(["/api/webhook/pix"]);

/**
 * Rejects a state-changing request that did not come from the store's own page.
 *
 * `SameSite=Strict` on the session cookie is not enough by itself: same-*site*
 * includes sibling subdomains, so on a custom domain a compromised
 * `blog.servidor.com.br` could post to the panel with the owner's cookie
 * attached. A missing `Origin` is rejected too — every browser sends it on
 * POST, PUT and DELETE, so its absence means the request did not come from one.
 */
export async function requireSameOrigin(c: Context<AppEnv>, next: Next) {
  if (SAFE_METHODS.has(c.req.method) || SIGNED_ENDPOINTS.has(c.req.path)) {
    return next();
  }

  if (c.req.header("origin") !== publicOrigin(c.env, c.req.url)) {
    throw new ApiError(403, "Requisição bloqueada: origem inválida.");
  }
  return next();
}
