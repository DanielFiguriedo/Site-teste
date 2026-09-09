import { Hono } from "hono";
import { badRequest, notFound } from "../../lib/errors";
import { IMAGE_KEY_PATTERN, IMAGE_TYPES, detectImageType } from "../../lib/images";
import type { AppEnv } from "../../env";

export const adminUpload = new Hono<AppEnv>();

const MAX_SIZE = 2 * 1024 * 1024;

/**
 * Uploads a product image to R2.
 *
 * The key embeds a hash of the content, so the same file always yields the same
 * key and the response can be cached forever — replacing the image produces a
 * new key, with no cache invalidation needed.
 *
 * The format is decided by reading the file's own first bytes. The multipart
 * `content-type` is written by whoever sent the request, so trusting it would
 * let an HTML file labelled `image/png` be stored as an image and later be
 * served from the store's origin.
 */
adminUpload.post("/admin/upload", async (c) => {
  // Refused on the declared length, before `formData()` buffers the whole body
  // into an isolate that has 128 MB — Cloudflare accepts a request body up to
  // 100 MB, and this route is reachable by anyone holding an admin session.
  // The multipart envelope adds a little, hence the margin; `file.size` below
  // is still the authority on the actual limit.
  if (Number(c.req.header("content-length") ?? 0) > MAX_SIZE * 2) {
    throw badRequest("A imagem precisa ter no máximo 2 MB.");
  }

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) throw badRequest("Envie um arquivo no campo 'file'.");

  if (file.size > MAX_SIZE) {
    throw badRequest("A imagem precisa ter no máximo 2 MB.");
  }

  const bytes = await file.arrayBuffer();
  const extension = detectImageType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));

  if (!extension) {
    throw badRequest("Formato não aceito. Use PNG, JPG, WEBP ou GIF.");
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const key = `products/${hash}.${extension}`;

  await c.env.BUCKET.put(key, bytes, {
    httpMetadata: {
      contentType: IMAGE_TYPES[extension],
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return c.json({ key, url: `/api/images/${key}` }, 201);
});

adminUpload.delete("/admin/upload/:key{.+}", async (c) => {
  const key = c.req.param("key");

  // Bounded to the keys this route creates. Without it, one mistyped request
  // could delete anything else that ever lands in the bucket.
  if (!IMAGE_KEY_PATTERN.test(key)) throw notFound("Imagem");

  await c.env.BUCKET.delete(key);
  return c.json({ ok: true });
});
