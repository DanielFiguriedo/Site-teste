import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/Button";
import { cn } from "../lib/cn";

type SettingsMap = Record<string, string | null>;

const FIELDS: { key: string; label: string; hint?: string; multiline?: boolean }[] = [
  { key: "server_name", label: "Nome do servidor" },
  { key: "server_ip", label: "IP do servidor", hint: "Aparece no botão de copiar" },
  { key: "logo_url", label: "URL do logo", hint: "Opcional" },
  { key: "discord_invite", label: "Convite do Discord", hint: "Opcional" },
  { key: "delivery_time", label: "Prazo de entrega", hint: 'Frase curta: "em até 24 horas"' },
  {
    key: "delivery_notice",
    label: "Aviso sobre a entrega",
    hint: "Mostrado na home, no produto e no checkout",
    multiline: true,
  },
  { key: "terms_md", label: "Termos de uso", hint: "Markdown", multiline: true },
  { key: "refund_policy_md", label: "Política de reembolso", hint: "Markdown", multiline: true },
];

export function AdminSettings() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<SettingsMap>("/admin/settings")
      .then(setSettings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await api("/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-card bg-surface-1" />;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold">Configurações</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Textos e dados da loja. Alterar aqui não exige publicar nada.
      </p>

      <div className="mt-6 space-y-4">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {field.label}
              </span>
              {field.hint && <span className="text-[0.6875rem] text-ink-faint">{field.hint}</span>}
            </span>

            {field.multiline ? (
              <textarea
                rows={4}
                value={settings[field.key] ?? ""}
                onChange={(e) =>
                  setSettings((current) => ({ ...current, [field.key]: e.target.value }))
                }
                className={cn(input, "h-auto py-3 leading-relaxed")}
              />
            ) : (
              <input
                value={settings[field.key] ?? ""}
                onChange={(e) =>
                  setSettings((current) => ({ ...current, [field.key]: e.target.value }))
                }
                className={input}
              />
            )}
          </label>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-control border border-danger/25 bg-danger/10 p-3 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        <span role="status" className="text-sm text-ink-muted">
          {saved && "Salvo."}
        </span>
      </div>
    </div>
  );
}

const input =
  "h-11 w-full rounded-control border border-line bg-surface-inset px-3 text-sm text-ink " +
  "outline-none transition-colors focus:border-accent placeholder:text-ink-faint";
