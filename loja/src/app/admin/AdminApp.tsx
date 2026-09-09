import { Link, NavLink, Route, Routes } from "react-router";
import { useAdmin } from "./useAdmin";
import { Login } from "./Login";
import { AdminOrders } from "./Orders";
import { AdminProducts } from "./Products";
import { AdminSettings } from "./Settings";
import { Button } from "../components/Button";
import { cn } from "../lib/cn";

const LINKS = [
  { to: "/admin", label: "Pedidos", end: true },
  { to: "/admin/products", label: "Produtos", end: false },
  { to: "/admin/settings", label: "Configurações", end: false },
];

/**
 * Admin panel.
 *
 * The guard here is UI only: the real decision is the `requireAdmin` middleware
 * in the Worker. Hiding the screen without protecting the API would protect
 * nothing — anyone could call the endpoints directly.
 */
export function AdminApp() {
  const { admin, checking, check, signOut } = useAdmin();

  if (checking) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-sm text-ink-muted">Carregando painel...</p>
      </div>
    );
  }

  if (!admin) return <Login onSignIn={check} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 glass">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Link to="/admin" className="font-display text-base font-bold">
            Painel
          </Link>

          <nav className="flex items-center gap-1" aria-label="Seções do painel">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-control px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive ? "text-accent" : "text-ink-muted hover:text-ink",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link to="/" className="hidden text-xs text-ink-muted hover:text-ink sm:block">
              Ver a loja
            </Link>
            <span className="hidden max-w-[16ch] truncate text-xs text-ink-muted md:block">
              {admin.email}
            </span>
            <Button variant="secondary" size="sm" onClick={signOut}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Routes>
          <Route index element={<AdminOrders />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="settings" element={<AdminSettings />} />
        </Routes>
      </main>
    </div>
  );
}
