import { Link } from "react-router";
import type { Product } from "@shared/types";
import { useApi } from "../lib/api";
import { useStore } from "../lib/store-context";
import { useCopyToClipboard } from "../lib/clipboard";
import { ButtonLink, Button } from "../components/Button";
import { ProductCard, ProductCardSkeleton } from "../components/ProductCard";
import { CategoryIcon, CheckIcon, CopyIcon, InfoIcon } from "../components/Icons";

function Hero() {
  const { settings } = useStore();
  const { copied, copy } = useCopyToClipboard();

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="aurora absolute inset-0" aria-hidden="true" />
      {/* Subtle block grid — a nod to the game without falling into pixel art. */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-ink) 1px, transparent 1px), linear-gradient(90deg, var(--color-ink) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(70% 60% at 50% 0%, black, transparent)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 text-center sm:pt-28">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Loja oficial
        </p>

        <h1 className="mx-auto max-w-3xl font-display text-4xl font-extrabold leading-[1.08] sm:text-6xl">
          Suba de nível no <span className="text-accent">{settings?.serverName ?? "servidor"}</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-muted">
          VIPs, cash, kits e chaves com pagamento por Pix. A confirmação é automática e a entrega é
          feita pela nossa equipe {settings?.deliveryTime ?? "rapidamente"}.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink to="/shop" size="lg">
            Ver produtos
          </ButtonLink>

          {settings?.serverIp && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => copy(settings.serverIp!)}
              className="tabular"
              aria-label={`Copiar o IP do servidor, ${settings.serverIp}`}
            >
              <span className="h-4 w-4" aria-hidden="true">
                {copied ? <CheckIcon /> : <CopyIcon />}
              </span>
              {copied ? "IP copiado!" : settings.serverIp}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const { categories } = useStore();
  if (categories.length === 0) return null;

  return (
    <section className="mx-auto -mt-10 max-w-6xl px-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => (
          <Link
            key={category.id}
            to={`/shop?category=${category.slug}`}
            className="group flex items-center gap-3 rounded-card border border-line bg-surface-1 p-4 shadow-card transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-surface-2 p-2.5 text-ink-muted transition-colors group-hover:text-ink">
              <CategoryIcon name={category.icon} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold">{category.name}</span>
              {category.description && (
                <span className="block truncate text-xs text-ink-muted">
                  {category.description}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Featured() {
  const { data, loading, error } = useApi<Product[]>("/products?featured=1");

  // With nothing featured the whole section disappears, instead of leaving a
  // lone heading above an empty area.
  if (!loading && !error && data?.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 pt-20">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Em destaque</h2>
          <p className="mt-1 text-sm text-ink-muted">O que os jogadores mais compram.</p>
        </div>
        <Link to="/shop" className="shrink-0 text-sm font-semibold text-ink-muted hover:text-ink">
          Ver tudo →
        </Link>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-card border border-line bg-surface-1 p-6 text-sm text-ink-muted"
        >
          Não foi possível carregar os produtos agora. Recarregue a página em instantes.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }, (_, index) => <ProductCardSkeleton key={index} />)
            : data?.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      )}
    </section>
  );
}

const STEPS = [
  {
    title: "Escolha o produto",
    text: "Selecione o VIP, o cash ou o item que você quer e informe o seu nick.",
  },
  {
    title: "Pague com Pix",
    text: "Escaneie o QR Code ou use o copia e cola. A confirmação é automática.",
  },
  {
    title: "Receba no jogo",
    text: "Nossa equipe entrega o item no seu nick e você acompanha o status pelo site.",
  },
];

function HowItWorks() {
  const { settings } = useStore();

  return (
    <section className="mx-auto max-w-6xl px-4 pt-24">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">Como funciona</h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="rounded-card border border-line bg-surface-1 p-5">
            <span className="font-display text-3xl font-extrabold text-surface-3">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2 font-display text-base font-bold">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.text}</p>
          </div>
        ))}
      </div>

      {/* Said plainly and early: delivery is not instant. Hiding it would only
          move the frustration to support after the purchase. */}
      {settings?.deliveryNotice && (
        <div className="mt-4 flex gap-3 rounded-card border border-warn/25 bg-warn/8 p-4">
          <span className="mt-0.5 h-4 w-4 shrink-0 text-warn">
            <InfoIcon />
          </span>
          <p className="text-sm leading-relaxed text-ink-muted">{settings.deliveryNotice}</p>
        </div>
      )}
    </section>
  );
}

export function Home() {
  return (
    <>
      <Hero />
      <Categories />
      <Featured />
      <HowItWorks />
    </>
  );
}
