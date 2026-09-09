import { Hono } from "hono";
import type { AppEnv } from "./env";
import { respostaErro } from "./lib/erros";
import { reconciliarPedidos } from "./lib/pedidos";
import { catalogo } from "./routes/catalog";
import { checkout } from "./routes/checkout";
import { pedidosPublicos } from "./routes/orders";
import { webhook } from "./routes/webhook";
import { dev } from "./routes/dev";
import { sessaoAdmin } from "./routes/admin/sessao";
import { catalogoAdmin } from "./routes/admin/catalogo";
import { pedidosAdmin } from "./routes/admin/pedidos";
import { uploadAdmin } from "./routes/admin/upload";
import type { ApiErro } from "@shared/types";

const app = new Hono<AppEnv>();

app.onError((e, c) => respostaErro(c, e));

// Público
app.route("/api", catalogo);
app.route("/api", checkout);
app.route("/api", pedidosPublicos);
app.route("/api", webhook);
app.route("/api", dev);

// Painel administrativo. Cada router aplica `exigirAdmin` nas próprias rotas,
// exceto o de sessão, onde o login precisa ser acessível sem sessão.
app.route("/api", sessaoAdmin);
app.route("/api", pedidosAdmin);
app.route("/api", catalogoAdmin);
app.route("/api", uploadAdmin);

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
   * Reconsulta no gateway os pedidos aguardando pagamento (caso o webhook tenha
   * se perdido) e expira os vencidos.
   */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      reconciliarPedidos(env).catch((e) => console.error("Falha na reconciliação:", e)),
    );
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
