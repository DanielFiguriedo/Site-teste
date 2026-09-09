import { Link } from "react-router";
import type { Product } from "@shared/types";
import { formatBRL, discountPercent } from "@shared/money";
import { CategoryIcon } from "./Icons";
import { Badge } from "./Badge";
import { cn } from "../lib/cn";

export function ProductCard({ product }: { product: Product }) {
  const discount = product.originalPriceCents
    ? discountPercent(product.originalPriceCents, product.priceCents)
    : 0;
  const soldOut = product.stock !== null && product.stock <= 0;

  return (
    <Link
      to={`/product/${product.slug}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-card border border-line",
        "bg-surface-1 shadow-card transition-all duration-300 ease-[var(--ease-out-soft)]",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-lift",
        soldOut && "opacity-60",
      )}
    >
      {/* Image area. With no image on file, the category icon over a gradient
          keeps the card presentable instead of leaving a hole. */}
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-inset">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-105"
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_20%,var(--color-accent-glow),transparent_70%)]" />
            <div className="relative h-16 w-16 text-ink-faint transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-110">
              <CategoryIcon name={product.categorySlug} />
            </div>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {discount > 0 && <Badge tone="accent">-{discount}%</Badge>}
          {product.durationDays !== null && (
            <Badge tone="neutral">{product.durationDays} dias</Badge>
          )}
          {/* "Permanente" only makes sense on a time-limited VIP — never on a
              pay-what-you-want donation, which has no duration at all. */}
          {product.durationDays === null &&
            product.categorySlug === "vip" &&
            !product.payWhatYouWant && <Badge tone="warn">Permanente</Badge>}
        </div>

        {soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-surface-0/70">
            <Badge tone="danger">Esgotado</Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-[0.95rem] font-bold leading-snug text-ink">
          {product.name}
        </h3>
        {product.shortDescription && (
          <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
            {product.shortDescription}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="flex flex-col">
            {product.originalPriceCents && (
              <span className="tabular text-xs text-ink-muted line-through">
                {formatBRL(product.originalPriceCents)}
              </span>
            )}
            <span className="tabular font-display text-xl font-bold text-accent">
              {product.payWhatYouWant ? "Você escolhe" : formatBRL(product.priceCents)}
            </span>
          </div>

          <span
            className={cn(
              "rounded-control bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-muted",
              "transition-colors duration-200 group-hover:bg-accent group-hover:text-accent-ink",
            )}
          >
            Comprar
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Placeholder with the same silhouette as the card, so loading does not jump. */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-1">
      <div className="aspect-[4/3] animate-pulse bg-surface-2" />
      <div className="space-y-2.5 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded-control bg-surface-2" />
        <div className="h-3 w-full animate-pulse rounded-control bg-surface-2" />
        <div className="h-6 w-1/3 animate-pulse rounded-control bg-surface-2" />
      </div>
    </div>
  );
}
