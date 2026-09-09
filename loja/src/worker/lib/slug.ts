/**
 * Builds a readable slug from a product or category name.
 *
 * `NFD` splits a letter from its accent, and stripping the combining marks
 * removes the accent. Without that step "AÇÃO" would become "a-a-o" instead of
 * "acao", because the loose accent would fall into the invalid-character rule.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
