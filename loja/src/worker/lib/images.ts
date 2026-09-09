/**
 * What counts as a product image, in one place.
 *
 * Both ends of the image path use this: the upload decides what it will store,
 * and the public route decides what it will serve. They have to agree, because
 * a mismatch is exactly how a file gets in as one thing and comes out as
 * another.
 */

/** Accepted formats. SVG is absent on purpose: it can carry script. */
export const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
} as const;

export type ImageExtension = keyof typeof IMAGE_TYPES;

/**
 * Keys produced by the upload route, and nothing else.
 *
 * Pinning the shape means a product's `imageKey` cannot be pointed at some
 * other object in the bucket, and the delete endpoint cannot be aimed outside
 * the product images.
 */
export const IMAGE_KEY_PATTERN = /^products\/[0-9a-f]{24}\.(png|jpg|webp|gif)$/;

/**
 * Content type for a stored key, from its extension.
 *
 * Returning null means "this store does not serve that", which is the right
 * answer for anything else that might be sitting in the bucket.
 */
export function imageContentType(key: string): string | null {
  if (!IMAGE_KEY_PATTERN.test(key)) return null;
  const extension = key.slice(key.lastIndexOf(".") + 1) as ImageExtension;
  return IMAGE_TYPES[extension] ?? null;
}

const startsWith = (bytes: Uint8Array, magic: number[], offset = 0) =>
  magic.every((byte, index) => bytes[offset + index] === byte);

/**
 * Identifies the format from the file's own bytes.
 *
 * The multipart `content-type` is written by whoever sent the request, so
 * trusting it means an HTML file labelled `image/png` gets stored as an image.
 * The magic number is the file itself, and cannot be relabelled.
 */
export function detectImageType(bytes: Uint8Array): ImageExtension | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  // WEBP is a RIFF container: "RIFF" <4 bytes of length> "WEBP".
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
}
