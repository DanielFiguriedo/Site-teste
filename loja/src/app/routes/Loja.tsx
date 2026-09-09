import { useSearchParams } from "react-router";
import type { Produto } from "@shared/types";
import { useApi } from "../lib/api";
import { useLoja } from "../lib/loja-context";
import { ProdutoCard, ProdutoCardEsqueleto } from "../components/ProdutoCard";
import { ChipLink } from "../components/Chip";

export function Loja() {
  const [params] = useSearchParams();
  const categoriaAtiva = params.get("categoria");
  const { categorias } = useLoja();

  const { dados, carregando, erro } = useApi<Produto[]>(
    categoriaAtiva ? `/produtos?categoria=${encodeURIComponent(categoriaAtiva)}` : "/produtos",
  );

  const nomeCategoria = categorias.find((c) => c.slug === categoriaAtiva)?.nome;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
        {nomeCategoria ?? "Todos os produtos"}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Pagamento por Pix. Entrega feita pela equipe após a confirmação.
      </p>

      <nav className="mt-7 flex flex-wrap gap-2" aria-label="Categorias">
        <ChipLink para="/loja" ativo={!categoriaAtiva}>
          Tudo
        </ChipLink>
        {categorias.map((c) => (
          <ChipLink key={c.id} para={`/loja?categoria=${c.slug}`} ativo={categoriaAtiva === c.slug}>
            {c.nome}
          </ChipLink>
        ))}
      </nav>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {carregando && Array.from({ length: 8 }, (_, i) => <ProdutoCardEsqueleto key={i} />)}
        {dados?.map((p) => <ProdutoCard key={p.id} produto={p} />)}
      </div>

      {erro && <p className="mt-8 text-sm text-danger">{erro}</p>}
      {!carregando && !erro && dados?.length === 0 && (
        <p className="mt-12 text-center text-sm text-ink-muted">
          Nenhum produto nesta categoria por enquanto.
        </p>
      )}
    </div>
  );
}
