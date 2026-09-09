import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErro } from "@shared/types";

/**
 * Erro de negócio com status HTTP. Lançar isto em qualquer rota produz uma
 * resposta JSON consistente via o handler `onError` do app.
 */
export class ErroApi extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
    readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = "ErroApi";
  }
}

export const naoEncontrado = (o = "Recurso") => new ErroApi(404, `${o} não encontrado.`);
export const requisicaoInvalida = (m: string, d?: unknown) => new ErroApi(400, m, d);
export const naoAutorizado = (m = "Não autorizado.") => new ErroApi(401, m);

export function respostaErro(c: Context, e: unknown) {
  if (e instanceof ErroApi) {
    const corpo: ApiErro = { erro: e.message, detalhes: e.detalhes };
    return c.json(corpo, e.status);
  }
  console.error("Erro não tratado:", e);
  return c.json({ erro: "Erro interno do servidor." } satisfies ApiErro, 500);
}
