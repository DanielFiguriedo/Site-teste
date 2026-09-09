import { Link, NavLink, Route, Routes } from "react-router";
import { useAdmin } from "./useAdmin";
import { Login } from "./Login";
import { PedidosAdmin } from "./Pedidos";
import { ProdutosAdmin } from "./Produtos";
import { ConfigAdmin } from "./Config";
import { Botao } from "../components/Botao";
import { cn } from "../lib/cn";

const LINKS = [
  { para: "/admin", rotulo: "Pedidos", exato: true },
  { para: "/admin/produtos", rotulo: "Produtos", exato: false },
  { para: "/admin/config", rotulo: "Configurações", exato: false },
];

/**
 * Painel administrativo.
 *
 * A guarda aqui é só de interface: quem decide de fato é o middleware
 * `exigirAdmin` no Worker. Esconder a tela sem proteger a API não protegeria
 * nada — qualquer um chamaria os endpoints direto.
 */
export function AdminApp() {
  const { admin, verificando, verificar, sair } = useAdmin();

  if (verificando) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-sm text-ink-muted">Carregando painel...</p>
      </div>
    );
  }

  if (!admin) return <Login aoEntrar={verificar} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 glass">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Link to="/admin" className="font-display text-base font-bold">
            Painel
          </Link>

          <nav className="flex items-center gap-1" aria-label="Seções do painel">
            {LINKS.map((l) => (
              <NavLink
                key={l.para}
                to={l.para}
                end={l.exato}
                className={({ isActive }) =>
                  cn(
                    "rounded-control px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive ? "text-accent" : "text-ink-muted hover:text-ink",
                  )
                }
              >
                {l.rotulo}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link to="/" className="hidden text-xs text-ink-faint hover:text-ink sm:block">
              Ver a loja
            </Link>
            <span className="hidden max-w-[16ch] truncate text-xs text-ink-faint md:block">
              {admin.email}
            </span>
            <Botao variante="secundario" tamanho="sm" onClick={sair}>
              Sair
            </Botao>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Routes>
          <Route index element={<PedidosAdmin />} />
          <Route path="produtos" element={<ProdutosAdmin />} />
          <Route path="config" element={<ConfigAdmin />} />
        </Routes>
      </main>
    </div>
  );
}
