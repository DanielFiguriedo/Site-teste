import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Botao } from "../components/Botao";
import { cn } from "../lib/cn";

type Config = Record<string, string | null>;

const CAMPOS: { chave: string; rotulo: string; dica?: string; area?: boolean }[] = [
  { chave: "nome_servidor", rotulo: "Nome do servidor" },
  { chave: "ip_servidor", rotulo: "IP do servidor", dica: "Aparece no botão de copiar" },
  { chave: "logo_url", rotulo: "URL do logo", dica: "Opcional" },
  { chave: "discord_convite", rotulo: "Convite do Discord", dica: "Opcional" },
  {
    chave: "prazo_entrega",
    rotulo: "Prazo de entrega",
    dica: 'Frase curta: "em até 24 horas"',
  },
  {
    chave: "aviso_entrega",
    rotulo: "Aviso sobre a entrega",
    dica: "Mostrado na home, no produto e no checkout",
    area: true,
  },
  { chave: "termos_md", rotulo: "Termos de uso", dica: "Markdown", area: true },
  { chave: "reembolso_md", rotulo: "Política de reembolso", dica: "Markdown", area: true },
];

export function ConfigAdmin() {
  const [config, setConfig] = useState<Config>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    api<Config>("/admin/config")
      .then(setConfig)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro(undefined);
    try {
      await api("/admin/config", { method: "PUT", body: JSON.stringify(config) });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <div className="h-64 animate-pulse rounded-card bg-surface-1" />;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold">Configurações</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Textos e dados da loja. Alterar aqui não exige publicar nada.
      </p>

      <div className="mt-6 space-y-4">
        {CAMPOS.map((campo) => (
          <label key={campo.chave} className="block">
            <span className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {campo.rotulo}
              </span>
              {campo.dica && (
                <span className="text-[0.6875rem] text-ink-faint">{campo.dica}</span>
              )}
            </span>

            {campo.area ? (
              <textarea
                rows={4}
                value={config[campo.chave] ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, [campo.chave]: e.target.value }))}
                className={cn(entrada, "h-auto py-3 leading-relaxed")}
              />
            ) : (
              <input
                value={config[campo.chave] ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, [campo.chave]: e.target.value }))}
                className={entrada}
              />
            )}
          </label>
        ))}
      </div>

      {erro && (
        <p role="alert" className="mt-4 rounded-control border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
          {erro}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Botao onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Botao>
        {salvo && <span className="text-sm text-accent">Salvo.</span>}
      </div>
    </div>
  );
}

const entrada =
  "h-11 w-full rounded-control border border-line bg-surface-inset px-3 text-sm text-ink " +
  "outline-none transition-colors focus:border-accent placeholder:text-ink-faint";
