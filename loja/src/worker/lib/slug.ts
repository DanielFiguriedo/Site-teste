/**
 * Gera um endereço legível a partir do nome do produto ou da categoria.
 *
 * `NFD` separa a letra do acento, e o intervalo `̀-ͯ` (marcas de
 * combinação) remove o acento — sem esse passo, "AÇÃO" viraria "a-a-o" em vez
 * de "acao", porque o acento solto cairia na regra de caracteres inválidos.
 */
export function gerarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
