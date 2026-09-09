import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Product } from "@shared/types";
import { formatBRL, discountPercent } from "@shared/money";
import { useApi } from "../lib/api";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Markdown } from "../components/Markdown";
import { CategoryIcon, InfoIcon } from "../components/Icons";
import { useStore } from "../lib/store-context";
import { cn } from "../lib/cn";

/** Minimum accepted on a pay-what-you-want donation, in cents. */
const MIN_PAY_WHAT_YOU_WANT = 100;

export function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { settings } = useStore();
  const { data: product, loading, error } = useApi<Product>(`/products/${slug}`);

  const [quantity, setQuantity] = useState(1);
  const [freeAmount, setFreeAmount] = useState("");

  if (loading) return <Skeleton />;

  if (error || !product) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-28 text-center">
        <h1 className="font-display text-2xl font-bold">Produto não encontrado</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {error ?? "Este produto não está mais à venda."}
        </p>
        <Link to="/shop" className="mt-6 inline-block text-sm font-semibold text-accent">
          Voltar para a loja
        </Link>
      </div>
    );
  }

  const freeCents = Math.round(Number(freeAmount.replace(",", ".")) * 100) || 0;
  const freeAmountOk = !product.payWhatYouWant || freeCents >= MIN_PAY_WHAT_YOU_WANT;
  const soldOut = product.stock !== null && product.stock <= 0;
  const discount = product.originalPriceCents
    ? discountPercent(product.originalPriceCents, product.priceCents)
    : 0;

  const total = product.payWhatYouWant ? freeCents : product.priceCents * quantity;
  const maxQuantity = product.stock === null ? 10 : Math.min(10, product.stock);

  const goToCheckout = () => {
    const params = new URLSearchParams({ product: product.slug });
    if (product.payWhatYouWant) params.set("amount", String(freeCents));
    else params.set("qty", String(quantity));
    navigate(`/checkout?${params}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-ink-muted" aria-label="Trilha">
        <Link to="/shop" className="hover:text-ink">
          Loja
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/shop?category=${product.categorySlug}`} className="hover:text-ink">
          {product.categoryName}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-last lg:order-none">
          <div className="relative aspect-[16/10] overflow-hidden rounded-card border border-line bg-surface-inset">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="relative grid h-full w-full place-items-center">
                <div className="absolute inset-0 bg-[radial-gradient(65%_60%_at_50%_25%,var(--color-accent-glow),transparent_70%)]" />
                <div className="relative h-24 w-24 text-ink-faint">
                  <CategoryIcon name={product.categorySlug} />
                </div>
              </div>
            )}

            <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
              {discount > 0 && <Badge tone="accent">-{discount}%</Badge>}
              {product.durationDays !== null && (
                <Badge tone="neutral">{product.durationDays} dias</Badge>
              )}
              {product.durationDays === null &&
                product.categorySlug === "vip" &&
                !product.payWhatYouWant && <Badge tone="warn">Permanente</Badge>}
            </div>
          </div>

          <h1 className="mt-6 font-display text-2xl font-extrabold sm:text-3xl">{product.name}</h1>
          {product.shortDescription && (
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-muted">
              {product.shortDescription}
            </p>
          )}

          {product.descriptionMd && (
            <div className="mt-6 rounded-card border border-line bg-surface-1 p-5">
              <Markdown text={product.descriptionMd} level={2} />
            </div>
          )}
        </div>

        {/* Purchase panel. Sticks to the top on desktop and, on mobile, comes
            before the description: with a long text the CTA used to sit two or
            three scrolls down — and mobile is where most purchases happen. */}
        <aside className="order-first lg:order-none lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border border-line bg-surface-1 p-5 shadow-card">
            {product.originalPriceCents && (
              <p className="tabular text-sm text-ink-muted line-through">
                {formatBRL(product.originalPriceCents)}
              </p>
            )}
            <p className="tabular font-display text-3xl font-extrabold text-accent">
              {product.payWhatYouWant ? "Você escolhe" : formatBRL(product.priceCents)}
            </p>

            {product.payWhatYouWant ? (
              <label className="mt-5 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Valor da contribuição
                </span>
                <div className="flex items-center gap-2 rounded-control border border-line bg-surface-inset px-3 transition-colors focus-within:border-accent">
                  <span className="text-sm font-semibold text-ink-muted">R$</span>
                  <input
                    inputMode="decimal"
                    value={freeAmount}
                    onChange={(e) => setFreeAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="10,00"
                    aria-label="Valor da contribuição em reais"
                    className="tabular h-12 w-full bg-transparent font-display text-lg font-bold outline-none placeholder:text-ink-faint"
                  />
                </div>
                {freeAmount && !freeAmountOk && (
                  <span className="tabular mt-1.5 block text-xs text-danger">
                    O valor mínimo é {formatBRL(MIN_PAY_WHAT_YOU_WANT)}.
                  </span>
                )}
              </label>
            ) : (
              <div className="mt-5">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Quantidade
                </span>
                <div className="flex items-center gap-2">
                  <QuantityButton
                    label="Diminuir quantidade"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    disabled={quantity <= 1}
                  >
                    &minus;
                  </QuantityButton>
                  <span className="tabular w-12 text-center font-display text-lg font-bold">
                    {quantity}
                  </span>
                  <QuantityButton
                    label="Aumentar quantidade"
                    onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                    disabled={quantity >= maxQuantity}
                  >
                    +
                  </QuantityButton>
                </div>
              </div>
            )}

            {!product.payWhatYouWant && quantity > 1 && (
              <p className="tabular mt-4 text-sm text-ink-muted">
                Total: <span className="font-semibold text-ink">{formatBRL(total)}</span>
              </p>
            )}

            <Button
              size="lg"
              className="mt-5 w-full"
              disabled={soldOut || !freeAmountOk || total <= 0}
              onClick={goToCheckout}
            >
              {soldOut ? "Esgotado" : "Comprar com Pix"}
            </Button>

            {product.stock !== null && product.stock > 0 && product.stock <= 5 && (
              <p className="mt-3 text-center text-xs text-warn">
                Restam apenas {product.stock} unidades.
              </p>
            )}

            <div className="mt-5 flex gap-2.5 border-t border-line pt-4">
              <span className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted">
                <InfoIcon />
              </span>
              <p className="text-xs leading-relaxed text-ink-muted">
                A entrega é feita pela nossa equipe {settings?.deliveryTime ?? "após a confirmação"},
                depois que o Pix for confirmado.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function QuantityButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-control border border-line bg-surface-2",
        "font-display text-lg font-bold text-ink transition-colors",
        "hover:border-line-strong hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-last lg:order-none">
          <div className="aspect-[16/10] animate-pulse rounded-card bg-surface-1" />
          <div className="mt-6 h-8 w-2/3 animate-pulse rounded-control bg-surface-1" />
          <div className="mt-3 h-4 w-full animate-pulse rounded-control bg-surface-1" />
        </div>
        <div className="order-first h-72 animate-pulse rounded-card bg-surface-1 lg:order-none" />
      </div>
    </div>
  );
}
