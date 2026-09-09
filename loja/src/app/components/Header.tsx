import { useState } from "react";
import { Link, NavLink } from "react-router";
import { useLoja } from "../lib/loja-context";
import { useJogador } from "../lib/nick";
import { AvatarNick } from "./AvatarNick";
import { useCopiar } from "../lib/copiar";
import { IconeCheque, IconeCopiar, IconeUsuario } from "./Icones";
import { ModalNick } from "./ModalNick";
import { cn } from "../lib/cn";

function PillIp({ ip }: { ip: string }) {
  const { copiado, copiar } = useCopiar();
  return (
    <button
      onClick={() => copiar(ip)}
      title="Copiar o IP do servidor"
      className={cn(
        "hidden items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5",
        "text-xs font-semibold transition-colors hover:border-line-strong sm:inline-flex",
        copiado ? "text-accent" : "text-ink-muted hover:text-ink",
      )}
    >
      <span className="h-3.5 w-3.5">{copiado ? <IconeCheque /> : <IconeCopiar />}</span>
      <span className="tabular">{copiado ? "IP copiado!" : ip}</span>
    </button>
  );
}

const LINKS = [
  { para: "/", rotulo: "Início", exato: true },
  { para: "/loja", rotulo: "Loja", exato: false },
  { para: "/pedido", rotulo: "Meu pedido", exato: false },
];

export function Header() {
  const { config } = useLoja();
  const { jogador } = useJogador();
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 glass">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            {config?.logoUrl ? (
              <img src={config.logoUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-md bg-accent font-display text-sm font-extrabold text-accent-ink">
                {(config?.nomeServidor ?? "L").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="font-display text-base font-bold tracking-tight">
              {config?.nomeServidor ?? "Loja"}
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {LINKS.map((l) => (
              <NavLink
                key={l.para}
                to={l.para}
                end={l.exato}
                className={({ isActive }) =>
                  cn(
                    "rounded-control px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                    isActive ? "text-accent" : "text-ink-muted hover:text-ink",
                  )
                }
              >
                {l.rotulo}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {config?.ipServidor && <PillIp ip={config.ipServidor} />}

            <button
              onClick={() => setModalAberto(true)}
              className={cn(
                "flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-1 pr-3",
                "text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink",
              )}
              title={jogador ? "Trocar de nick" : "Informe seu nick"}
            >
              {jogador ? (
                <AvatarNick nick={jogador.nick} tamanho={28} className="rounded-full" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-inset">
                  <span className="h-4 w-4 text-ink-faint">
                    <IconeUsuario />
                  </span>
                </span>
              )}
              <span className="max-w-[9ch] truncate">{jogador?.nick ?? "Entrar"}</span>
            </button>
          </div>
        </div>
      </header>

      <ModalNick aberto={modalAberto} aoFechar={() => setModalAberto(false)} />
    </>
  );
}
