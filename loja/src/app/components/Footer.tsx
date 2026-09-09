import { Link } from "react-router";
import { useLoja } from "../lib/loja-context";

export function Footer() {
  const { config } = useLoja();

  return (
    <footer className="mt-24 border-t border-line bg-surface-inset">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="font-display text-base font-bold">{config?.nomeServidor ?? "Loja"}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Loja oficial do servidor. Pagamento via Pix, com confirmação automática.
          </p>
        </div>

        <nav className="text-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Loja</p>
          <ul className="space-y-2 text-ink-muted">
            <li><Link to="/loja" className="hover:text-ink">Todos os produtos</Link></li>
            <li><Link to="/pedido" className="hover:text-ink">Acompanhar pedido</Link></li>
          </ul>
        </nav>

        <nav className="text-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Legal</p>
          <ul className="space-y-2 text-ink-muted">
            <li><Link to="/termos" className="hover:text-ink">Termos de uso</Link></li>
            <li><Link to="/reembolso" className="hover:text-ink">Política de reembolso</Link></li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-line py-5">
        <p className="mx-auto max-w-6xl px-4 text-xs text-ink-faint">
          Não somos afiliados à Mojang AB ou à Microsoft. Minecraft é uma marca registrada da Mojang AB.
        </p>
      </div>
    </footer>
  );
}
