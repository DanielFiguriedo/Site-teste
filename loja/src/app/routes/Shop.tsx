import { useSearchParams } from "react-router";
import type { Product } from "@shared/types";
import { useApi } from "../lib/api";
import { useStore } from "../lib/store-context";
import { ProductCard, ProductCardSkeleton } from "../components/ProductCard";
import { ChipLink } from "../components/Chip";

export function Shop() {
  const [params] = useSearchParams();
  const activeCategory = params.get("category");
  const { categories } = useStore();

  const { data, loading, error } = useApi<Product[]>(
    activeCategory ? `/products?category=${encodeURIComponent(activeCategory)}` : "/products",
  );

  const categoryName = categories.find((category) => category.slug === activeCategory)?.name;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
        {categoryName ?? "Todos os produtos"}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Pagamento por Pix. Entrega feita pela equipe após a confirmação.
      </p>

      <nav className="mt-7 flex flex-wrap gap-2" aria-label="Categorias">
        <ChipLink to="/shop" active={!activeCategory}>
          Tudo
        </ChipLink>
        {categories.map((category) => (
          <ChipLink
            key={category.id}
            to={`/shop?category=${category.slug}`}
            active={activeCategory === category.slug}
          >
            {category.name}
          </ChipLink>
        ))}
      </nav>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && Array.from({ length: 8 }, (_, index) => <ProductCardSkeleton key={index} />)}
        {data?.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>

      {error && (
        <p role="alert" className="mt-8 text-sm text-danger">
          {error}
        </p>
      )}
      {!loading && !error && data?.length === 0 && (
        <p className="mt-12 text-center text-sm text-ink-muted">
          Nenhum produto nesta categoria por enquanto.
        </p>
      )}
    </div>
  );
}
