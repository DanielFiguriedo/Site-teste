import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError as ApiErrorBody } from "@shared/types";

/**
 * Business error carrying an HTTP status. Throwing this from any route produces
 * a consistent JSON response through the app's `onError` handler.
 *
 * Messages are Portuguese because they are shown to the user.
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what = "Recurso") => new ApiError(404, `${what} não encontrado.`);
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, details);
export const unauthorized = (message = "Não autorizado.") => new ApiError(401, message);

export function errorResponse(c: Context, e: unknown) {
  if (e instanceof ApiError) {
    const body: ApiErrorBody = { error: e.message, details: e.details };
    return c.json(body, e.status);
  }
  console.error("Unhandled error:", e);
  return c.json({ error: "Erro interno do servidor." } satisfies ApiErrorBody, 500);
}
