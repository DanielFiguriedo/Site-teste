import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Produto as TProduto } from "@shared/types";
import { formatarBRL, percentualDesconto } from "@shared/dinheiro";
import { useApi } from "../lib/api";
import { Botao } from "../components/Botao";
import { Selo } from "../components/Selo";
import { Markdown } from "../components/Markdown";
import { IconeCategoria, IconeInfo } from "../components/Icones";
import { useLoja } from "../lib/loja-context";
import { cn } from "../lib/cn";

/** Valor mínimo aceito numa doação de valor livre, em centavos. */
const MINIMO_LIVRE = 100;

export function ProdutoPagina() {
  const { slug } = useParams();
  const navegar = useNavigate();
  const { config } = useLoja();
  const { dados: produto, carregando, erro } = useApi<TProduto>(`/produtos/${slug}`);

  const [quantidade, setQuantidade] = useState(1);
  const [valorLivre, setValorLivre] = useState("");

  if (carregando) return <Esqueleto />;

  if (erro || !produto) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-28 text-center">
        <h1 className="font-display text-2xl font-bold">Produto não encontrado</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {erro ?? "Este produto não está mais à venda."}
        </p>
        <Link to="/loja" className="mt-6 inline-block text-sm font-semibold text-accent">
          Voltar para a loja
        </Link>
      </div>
    );
  }

  const centavosLivre = Math.round(Number(valorLivre.replace(",", ".")) * 100) || 0;
  const livreValido = !produto.precoLivre || centavosLivre >= MINIMO_LIVRE;
  const esgotado = produto.estoque !== null && produto.estoque <= 0;
  const desconto = produto.precoDeCentavos
    ? percentualDesconto(produto.precoDeCentavos, produto.precoCentavos)
    : 0;

  const total = produto.precoLivre ? centavosLivre : produto.precoCentavos * quantidade;
  const maxQuantidade = produto.estoque === null ? 10 : Math.min(10, produto.estoque);

  const irParaCheckout = () => {
    const params = new URLSearchParams({ produto: produto.slug });
    if (produto.precoLivre) params.set("valor", String(centavosLivre));
    else params.set("qtd", String(quantidade));
    navegar(`/checkout?${params}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-ink-faint" aria-label="Trilha">
        <Link to="/loja" className="hover:text-ink">
          Loja
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/loja?categoria=${produto.categoriaSlug}`} className="hover:text-ink">
          {produto.categoriaNome}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-last lg:order-none">
          <div className="relative aspect-[16/10] overflow-hidden rounded-card border border-line bg-surface-inset">
            {produto.imagemUrl ? (
              <img
                src={produto.imagemUrl}
                alt={produto.nome}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="relative grid h-full w-full place-items-center">
                <div className="absolute inset-0 bg-[radial-gradient(65%_60%_at_50%_25%,var(--color-accent-glow),transparent_70%)]" />
                <div className="relative h-24 w-24 text-ink-faint">
                  <IconeCategoria nome={produto.categoriaSlug} />
                </div>
              </div>
            )}

            <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
              {desconto > 0 && <Selo tom="accent">-{desconto}%</Selo>}
              {produto.duracaoDias !== null && <Selo tom="neutro">{produto.duracaoDias} dias</Selo>}
              {produto.duracaoDias === null &&
                produto.categoriaSlug === "vip" &&
                !produto.precoLivre && <Selo tom="warn">Permanente</Selo>}
            </div>
          </div>

          <h1 className="mt-6 font-display text-2xl font-extrabold sm:text-3xl">{produto.nome}</h1>
          {produto.descricaoCurta && (
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-muted">
              {produto.descricaoCurta}
            </p>
          )}

          {produto.descricaoMd && (
            <div className="mt-6 rounded-card border border-line bg-surface-1 p-5">
              <Markdown texto={produto.descricaoMd} nivel={2} />
            </div>
          )}
        </div>

        {/* Painel de compra. Gruda no topo no desktop e, no celular, vem antes
           da descrição: com um texto longo, o CTA ficava a duas ou três
           rolagens do topo — e é no celular que a maioria compra. */}
        <aside className="order-first lg:order-none lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border border-line bg-surface-1 p-5 shadow-card">
            {produto.precoDeCentavos && (
              <p className="tabular text-sm text-ink-muted line-through">
                {formatarBRL(produto.precoDeCentavos)}
              </p>
            )}
            <p className="tabular font-display text-3xl font-extrabold text-accent">
              {produto.precoLivre ? "Você escolhe" : formatarBRL(produto.precoCentavos)}
            </p>

            {produto.precoLivre ? (
              <label className="mt-5 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Valor da contribuição
                </span>
                <div className="flex items-center gap-2 rounded-control border border-line bg-surface-inset px-3 transition-colors focus-within:border-accent">
                  <span className="text-sm font-semibold text-ink-faint">R$</span>
                  <input
                    inputMode="decimal"
                    value={valorLivre}
                    onChange={(e) => setValorLivre(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="10,00"
                    className="tabular h-12 w-full bg-transparent font-display text-lg font-bold outline-none placeholder:text-ink-faint"
                  />
                </div>
                {valorLivre && !livreValido && (
                  <span className="tabular mt-1.5 block text-xs text-danger">
                    O valor mínimo é {formatarBRL(MINIMO_LIVRE)}.
                  </span>
                )}
              </label>
            ) : (
              <div className="mt-5">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Quantidade
                </span>
                <div className="flex items-center gap-2">
                  <BotaoQtd
                    rotulo="Diminuir quantidade"
                    onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                    desabilitado={quantidade <= 1}
                  >
                    &minus;
                  </BotaoQtd>
                  <span className="tabular w-12 text-center font-display text-lg font-bold">
                    {quantidade}
                  </span>
                  <BotaoQtd
                    rotulo="Aumentar quantidade"
                    onClick={() => setQuantidade((q) => Math.min(maxQuantidade, q + 1))}
                    desabilitado={quantidade >= maxQuantidade}
                  >
                    +
                  </BotaoQtd>
                </div>
              </div>
            )}

            {!produto.precoLivre && quantidade > 1 && (
              <p className="tabular mt-4 text-sm text-ink-muted">
                Total: <span className="font-semibold text-ink">{formatarBRL(total)}</span>
              </p>
            )}

            <Botao
              tamanho="lg"
              className="mt-5 w-full"
              disabled={esgotado || !livreValido || total <= 0}
              onClick={irParaCheckout}
            >
              {esgotado ? "Esgotado" : "Comprar com Pix"}
            </Botao>

            {produto.estoque !== null && produto.estoque > 0 && produto.estoque <= 5 && (
              <p className="mt-3 text-center text-xs text-warn">
                Restam apenas {produto.estoque} unidades.
              </p>
            )}

            <div className="mt-5 flex gap-2.5 border-t border-line pt-4">
              <span className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted">
                <IconeInfo />
              </span>
              <p className="text-xs leading-relaxed text-ink-muted">
                A entrega é feita pela nossa equipe {config?.prazoEntrega ?? "após a confirmação"},
                depois que o Pix for confirmado.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BotaoQtd({
  children,
  onClick,
  desabilitado,
  rotulo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  desabilitado: boolean;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={rotulo}
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

function Esqueleto() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="aspect-[16/10] animate-pulse rounded-card bg-surface-1" />
          <div className="mt-6 h-8 w-2/3 animate-pulse rounded bg-surface-1" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-surface-1" />
        </div>
        <div className="h-72 animate-pulse rounded-card bg-surface-1" />
      </div>
    </div>
  );
}
