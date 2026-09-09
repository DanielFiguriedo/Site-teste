import { Hono } from "hono";
import { exigirAdmin } from "../../lib/auth";
import { requisicaoInvalida } from "../../lib/erros";
import type { AppEnv } from "../../env";

export const uploadAdmin = new Hono<AppEnv>();

uploadAdmin.use("/admin/*", exigirAdmin);

/** Tipos aceitos. Lista fechada: SVG fica de fora porque pode carregar script. */
const TIPOS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const TAMANHO_MAXIMO = 2 * 1024 * 1024;

/**
 * Envia a imagem de um produto para o R2.
 *
 * A chave inclui um hash do conteúdo, então o mesmo arquivo sempre gera a mesma
 * chave e a resposta pode ser cacheada para sempre — trocar a imagem gera uma
 * chave nova, sem precisar invalidar cache.
 */
uploadAdmin.post("/admin/upload", async (c) => {
  const formulario = await c.req.formData().catch(() => null);
  const arquivo = formulario?.get("arquivo");

  if (!(arquivo instanceof File)) throw requisicaoInvalida("Envie um arquivo no campo 'arquivo'.");

  const extensao = TIPOS[arquivo.type];
  if (!extensao) {
    throw requisicaoInvalida("Formato não aceito. Use PNG, JPG, WEBP ou GIF.");
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw requisicaoInvalida("A imagem precisa ter no máximo 2 MB.");
  }

  const bytes = await arquivo.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const key = `produtos/${hash}.${extensao}`;

  await c.env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: arquivo.type, cacheControl: "public, max-age=31536000, immutable" },
  });

  return c.json({ key, url: `/api/imagens/${key}` }, 201);
});

uploadAdmin.delete("/admin/upload/:key{.+}", async (c) => {
  await c.env.BUCKET.delete(c.req.param("key"));
  return c.json({ ok: true });
});
