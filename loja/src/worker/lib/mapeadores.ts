import type { Categoria, Produto } from "@shared/types";

/** Toda imagem de produto é servida pelo próprio Worker a partir do R2. */
export function urlImagem(key: string | null): string | null {
  return key ? `/api/imagens/${key}` : null;
}

/** Converte um timestamp unix (segundos) do SQLite para ISO 8601. */
export function paraIso(segundos: number | null): string | null {
  return segundos == null ? null : new Date(segundos * 1000).toISOString();
}

type LinhaProduto = {
  id: number;
  categoriaId: number;
  slug: string;
  nome: string;
  descricaoCurta: string | null;
  descricaoMd: string | null;
  precoCentavos: number;
  precoDeCentavos: number | null;
  promocaoExpiraEm: number | null;
  duracaoDias: number | null;
  imagemKey: string | null;
  presenteavel: boolean;
  precoLivre: boolean;
  destaque: boolean;
  estoque: number | null;
};

export function paraProduto(
  p: LinhaProduto,
  categoria: { slug: string; nome: string },
): Produto {
  return {
    id: p.id,
    categoriaId: p.categoriaId,
    categoriaSlug: categoria.slug,
    categoriaNome: categoria.nome,
    slug: p.slug,
    nome: p.nome,
    descricaoCurta: p.descricaoCurta,
    descricaoMd: p.descricaoMd,
    precoCentavos: p.precoCentavos,
    // Um preço "de" menor ou igual ao atual não é promoção — é ruído. Some.
    precoDeCentavos:
      p.precoDeCentavos && p.precoDeCentavos > p.precoCentavos ? p.precoDeCentavos : null,
    promocaoExpiraEm: paraIso(p.promocaoExpiraEm),
    duracaoDias: p.duracaoDias,
    imagemUrl: urlImagem(p.imagemKey),
    presenteavel: p.presenteavel,
    precoLivre: p.precoLivre,
    destaque: p.destaque,
    estoque: p.estoque,
  };
}

export function paraCategoria(c: {
  id: number;
  slug: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  ordem: number;
}): Categoria {
  return {
    id: c.id,
    slug: c.slug,
    nome: c.nome,
    descricao: c.descricao,
    icone: c.icone,
    ordem: c.ordem,
  };
}
