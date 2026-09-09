import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/Button";

export function Login({ onSignIn }: { onSignIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await api("/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
      onSignIn();
    } catch (loginError) {
      setError((loginError as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-card border border-line bg-surface-1 p-7 shadow-lift"
      >
        <h1 className="font-display text-xl font-bold">Painel da loja</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Entre para ver os pedidos e os produtos.</p>

        <label className="mt-6 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            E-mail
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className="h-12 w-full rounded-control border border-line bg-surface-inset px-4 text-sm outline-none transition-colors focus:border-accent"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Senha
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-12 w-full rounded-control border border-line bg-surface-inset px-4 text-sm outline-none transition-colors focus:border-accent"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-control border border-danger/25 bg-danger/10 p-3 text-xs text-danger"
          >
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-6 w-full" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
