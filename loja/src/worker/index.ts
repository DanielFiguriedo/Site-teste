import { Hono } from "hono";
import type { AppEnv } from "./env";
import { respostaErro } from "./lib/erros";
import { catalogo } from "./routes/catalog";
import type { ApiErro } from "@shared/types";

const app = new Hono<AppEnv>();

app.onError((e, c) => respostaErro(c, e));

app.route("/api", catalogo);

app.get("/api/saude", (c) =>
  c.json({ ok: true, ambiente: c.env.AMBIENTE, agora: new Date().toISOString() }),
);

// Qualquer /api/* não mapeada é erro de API — nunca deve cair no index.html
// da SPA, senão o front recebe HTML onde espera JSON.
app.all("/api/*", (c) => c.json({ erro: "Rota não encontrada." } satisfies ApiErro, 404));

export default {
  fetch: app.fetch,

  /**
   * Cron a cada 5 minutos: rede de segurança do pagamento.
   * Reconsulta pedidos aguardando pagamento no gateway (caso o webhook tenha
   * se perdido) e expira os que passaram do prazo.
   */
  async scheduled(_controller, _env, _ctx) {
    // Implementado na fase de pagamento.
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
