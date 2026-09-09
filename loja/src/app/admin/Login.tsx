import { useState } from "react";
import { api } from "../lib/api";
import { Botao } from "../components/Botao";
import { cn } from "../lib/cn";

export function Login({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(undefined);
    try {
      await api("/admin/login", { method: "POST", body: JSON.stringify({ email, senha }) });
      aoEntrar();
    } catch (erroLogin) {
      setErro((erroLogin as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm rounded-card border border-line bg-surface-1 p-7 shadow-lift"
      >
        <h1 className="font-display text-xl font-bold">Painel da loja</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Entre para ver os pedidos e os produtos.</p>

        <label className="mt-6 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-faint">
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
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Senha
          </span>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
            className="h-12 w-full rounded-control border border-line bg-surface-inset px-4 text-sm outline-none transition-colors focus:border-accent"
          />
        </label>

        {erro && (
          <p
            role="alert"
            className={cn(
              "mt-4 rounded-control border border-danger/25 bg-danger/10 p-3 text-xs text-danger",
            )}
          >
            {erro}
          </p>
        )}

        <Botao type="submit" tamanho="lg" className="mt-6 w-full" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </Botao>
      </form>
    </div>
  );
}
