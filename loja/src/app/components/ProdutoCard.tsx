import { Link } from "react-router";
import type { Produto } from "@shared/types";
import { formatarBRL, percentualDesconto } from "@shared/dinheiro";
import { IconeCategoria } from "./Icones";
import { Selo } from "./Selo";
import { cn } from "../lib/cn";

function duracaoLegivel(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias % 30 === 0 && dias >= 30) {
    const meses = dias / 30;
    return meses === 1 ? "30 dias" : `${dias} dias`;
  }
  return `${dias} dias`;
}

export function ProdutoCard({ produto }: { produto: Produto }) {
  const desconto = produto.precoDeCentavos
    ? percentualDesconto(produto.precoDeCentavos, produto.precoCentavos)
    : 0;
  const duracao = duracaoLegivel(produto.duracaoDias);
  const esgotado = produto.estoque !== null && produto.estoque <= 0;

  return (
    <Link
      to={`/produto/${produto.slug}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-card border border-line",
        "bg-surface-1 shadow-card transition-all duration-300 ease-[var(--ease-out-soft)]",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-lift",
        esgotado && "opacity-60",
      )}
    >
      {/* Área da imagem. Sem imagem cadastrada, o ícone da categoria sobre um
          degradê mantém o card apresentável em vez de deixar um buraco. */}
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-inset">
        {produto.imagemUrl ? (
          <img
            src={produto.imagemUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-105"
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_20%,var(--color-accent-glow),transparent_70%)]" />
            <div className="relative h-16 w-16 text-accent/70 transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-110">
              <IconeCategoria nome={produto.categoriaSlug} />
            </div>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {desconto > 0 && <Selo tom="accent">-{desconto}%</Selo>}
          {duracao && <Selo tom="neutro">{duracao}</Selo>}
          {/* "Permanente" só faz sentido em VIP por tempo — nunca numa doação
              de valor livre, que não tem duração nenhuma. */}
          {produto.duracaoDias === null &&
            produto.categoriaSlug === "vip" &&
            !produto.precoLivre && <Selo tom="warn">Permanente</Selo>}
        </div>

        {esgotado && (
          <div className="absolute inset-0 grid place-items-center bg-surface-0/70">
            <Selo tom="danger">Esgotado</Selo>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-[0.95rem] font-bold leading-snug text-ink">
          {produto.nome}
        </h3>
        {produto.descricaoCurta && (
          <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
            {produto.descricaoCurta}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="flex flex-col">
            {produto.precoDeCentavos && (
              <span className="tabular text-xs text-ink-faint line-through">
                {formatarBRL(produto.precoDeCentavos)}
              </span>
            )}
            <span className="tabular font-display text-xl font-bold text-accent">
              {produto.precoLivre ? "Você escolhe" : formatarBRL(produto.precoCentavos)}
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

/** Placeholder com a mesma silhueta do card, para o carregamento não "pular". */
export function ProdutoCardEsqueleto() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-1">
      <div className="aspect-[4/3] animate-pulse bg-surface-2" />
      <div className="space-y-2.5 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-6 w-1/3 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}
