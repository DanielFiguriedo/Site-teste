import { useState } from "react";
import { Link, NavLink } from "react-router";
import { useStore } from "../lib/store-context";
import { usePlayer } from "../lib/player";
import { useCopyToClipboard } from "../lib/clipboard";
import { CheckIcon, CopyIcon, UserIcon } from "./Icons";
import { PlayerAvatar } from "./PlayerAvatar";
import { NickModal } from "./NickModal";
import { cn } from "../lib/cn";

function ServerIpPill({ ip }: { ip: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <button
      onClick={() => copy(ip)}
      aria-label={`Copiar o IP do servidor, ${ip}`}
      className={cn(
        "hidden items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5",
        "text-xs font-semibold transition-colors hover:border-line-strong sm:inline-flex",
        copied ? "text-accent" : "text-ink-muted hover:text-ink",
      )}
    >
      <span className="h-3.5 w-3.5" aria-hidden="true">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </span>
      <span className="tabular">{copied ? "IP copiado!" : ip}</span>
    </button>
  );
}

const LINKS = [
  { to: "/", label: "Início", end: true },
  { to: "/shop", label: "Loja", end: false },
  { to: "/order", label: "Meu pedido", end: false },
];

export function Header() {
  const { settings } = useStore();
  const { player } = usePlayer();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 glass">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-md bg-accent font-display text-sm font-extrabold text-accent-ink">
                {(settings?.serverName ?? "L").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden font-display text-base font-bold tracking-tight sm:inline">
              {settings?.serverName ?? "Loja"}
            </span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Navegação principal">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-control px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                    isActive ? "text-accent" : "text-ink-muted hover:text-ink",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {settings?.serverIp && <ServerIpPill ip={settings.serverIp} />}

            <button
              onClick={() => setModalOpen(true)}
              aria-label={player ? `Trocar o nick, hoje ${player.nick}` : "Informe seu nick"}
              className={cn(
                "flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-1 pr-3",
                "text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink",
              )}
            >
              {player ? (
                <PlayerAvatar nick={player.nick} size={28} className="rounded-full" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-inset">
                  <span className="h-4 w-4 text-ink-faint">
                    <UserIcon />
                  </span>
                </span>
              )}
              <span className="max-w-[9ch] truncate">{player?.nick ?? "Entrar"}</span>
            </button>
          </div>
        </div>
      </header>

      <NickModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
