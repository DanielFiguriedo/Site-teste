import { Hono } from "hono";
import { requireAdmin } from "../../lib/auth";
import { badRequest } from "../../lib/errors";
import type { AppEnv } from "../../env";

export const adminUpload = new Hono<AppEnv>();

adminUpload.use("/admin/*", requireAdmin);

/** Accepted types. Closed list: SVG is excluded because it can carry script. */
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_SIZE = 2 * 1024 * 1024;

/**
 * Uploads a product image to R2.
 *
 * The key embeds a hash of the content, so the same file always yields the same
 * key and the response can be cached forever — replacing the image produces a
 * new key, with no cache invalidation needed.
 */
adminUpload.post("/admin/upload", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) throw badRequest("Envie um arquivo no campo 'file'.");

  const extension = TYPES[file.type];
  if (!extension) {
    throw badRequest("Formato não aceito. Use PNG, JPG, WEBP ou GIF.");
  }
  if (file.size > MAX_SIZE) {
    throw badRequest("A imagem precisa ter no máximo 2 MB.");
  }

  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const key = `products/${hash}.${extension}`;

  await c.env.BUCKET.put(key, bytes, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return c.json({ key, url: `/api/images/${key}` }, 201);
});

adminUpload.delete("/admin/upload/:key{.+}", async (c) => {
  await c.env.BUCKET.delete(c.req.param("key"));
  return c.json({ ok: true });
});
