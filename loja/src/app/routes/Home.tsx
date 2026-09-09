import { Link } from "react-router";
import type { Produto } from "@shared/types";
import { useApi } from "../lib/api";
import { useLoja } from "../lib/loja-context";
import { useCopiar } from "../lib/copiar";
import { BotaoLink, Botao } from "../components/Botao";
import { ProdutoCard, ProdutoCardEsqueleto } from "../components/ProdutoCard";
import { IconeCategoria, IconeCheque, IconeCopiar, IconeInfo } from "../components/Icones";

function Hero() {
  const { config } = useLoja();
  const { copiado, copiar } = useCopiar();

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="aurora absolute inset-0" aria-hidden="true" />
      {/* Malha sutil de blocos — referência ao jogo sem cair em pixel art. */}
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
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          Loja oficial
        </p>

        <h1 className="mx-auto max-w-3xl font-display text-4xl font-extrabold leading-[1.08] sm:text-6xl">
          Suba de nível no{" "}
          <span className="text-accent">{config?.nomeServidor ?? "servidor"}</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-muted">
          VIPs, cash, kits e chaves com pagamento por Pix. A confirmação é
          automática e a entrega é feita pela nossa equipe {config?.prazoEntrega ?? "rapidamente"}.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <BotaoLink to="/loja" tamanho="lg">
            Ver produtos
          </BotaoLink>

          {config?.ipServidor && (
            <Botao
              variante="secundario"
              tamanho="lg"
              onClick={() => copiar(config.ipServidor!)}
              className="tabular"
            >
              <span className="h-4 w-4">{copiado ? <IconeCheque /> : <IconeCopiar />}</span>
              {copiado ? "IP copiado!" : config.ipServidor}
            </Botao>
          )}
        </div>
      </div>
    </section>
  );
}

function Categorias() {
  const { categorias } = useLoja();
  if (categorias.length === 0) return null;

  return (
    <section className="mx-auto -mt-10 max-w-6xl px-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {categorias.map((c) => (
          <Link
            key={c.id}
            to={`/loja?categoria=${c.slug}`}
            className="group flex items-center gap-3 rounded-card border border-line bg-surface-1 p-4 shadow-card transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-surface-2 p-2.5 text-accent transition-colors group-hover:bg-accent/15">
              <IconeCategoria nome={c.icone} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold">{c.nome}</span>
              {c.descricao && (
                <span className="block truncate text-xs text-ink-muted">{c.descricao}</span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Destaques() {
  const { dados, carregando } = useApi<Produto[]>("/produtos?destaque=1");

  return (
    <section className="mx-auto max-w-6xl px-4 pt-20">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Em destaque</h2>
          <p className="mt-1 text-sm text-ink-muted">O que os jogadores mais compram.</p>
        </div>
        <Link
          to="/loja"
          className="shrink-0 text-sm font-semibold text-accent hover:text-accent-hover"
        >
          Ver tudo →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {carregando
          ? Array.from({ length: 4 }, (_, i) => <ProdutoCardEsqueleto key={i} />)
          : dados?.map((p) => <ProdutoCard key={p.id} produto={p} />)}
      </div>
    </section>
  );
}

const PASSOS = [
  {
    titulo: "Escolha o produto",
    texto: "Selecione o VIP, o cash ou o item que você quer e informe o seu nick.",
  },
  {
    titulo: "Pague com Pix",
    texto: "Escaneie o QR Code ou use o copia e cola. A confirmação é automática.",
  },
  {
    titulo: "Receba no jogo",
    texto: "Nossa equipe entrega o item no seu nick e você acompanha o status pelo site.",
  },
];

function ComoFunciona() {
  const { config } = useLoja();

  return (
    <section className="mx-auto max-w-6xl px-4 pt-24">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">Como funciona</h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PASSOS.map((p, i) => (
          <div key={p.titulo} className="rounded-card border border-line bg-surface-1 p-5">
            <span className="font-display text-3xl font-extrabold text-accent/30">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2 font-display text-base font-bold">{p.titulo}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{p.texto}</p>
          </div>
        ))}
      </div>

      {/* Dito de forma explícita e cedo: a entrega não é instantânea. Esconder
          isso só transferiria a frustração para o suporte depois da compra. */}
      {config?.avisoEntrega && (
        <div className="mt-4 flex gap-3 rounded-card border border-warn/25 bg-warn/8 p-4">
          <span className="mt-0.5 h-4 w-4 shrink-0 text-warn">
            <IconeInfo />
          </span>
          <p className="text-sm leading-relaxed text-ink-muted">{config.avisoEntrega}</p>
        </div>
      )}
    </section>
  );
}

export function Home() {
  return (
    <>
      <Hero />
      <Categorias />
      <Destaques />
      <ComoFunciona />
    </>
  );
}
