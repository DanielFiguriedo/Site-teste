import { useStore } from "../lib/store-context";
import { Markdown } from "../components/Markdown";

/**
 * Terms of use and refund policy.
 *
 * The content is edited in the admin panel: the owner has to be able to adjust
 * it without a deploy, and in Brazil both pages are expected of an online store
 * (consumer law grants a 7-day right of withdrawal on distance purchases).
 */
export function LegalPage({
  title,
  field,
}: {
  title: string;
  field: "termsMd" | "refundPolicyMd";
}) {
  const { settings } = useStore();
  const text = settings?.[field];

  return (
    <div className="mx-auto max-w-2xl px-4 pt-12">
      <h1 className="font-display text-3xl font-extrabold">{title}</h1>

      <div className="mt-6 rounded-card border border-line bg-surface-1 p-6">
        {text ? (
          <Markdown text={text} level={2} />
        ) : (
          <p className="text-sm leading-relaxed text-ink-muted">
            Este texto ainda não foi preenchido. A equipe da loja pode escrevê-lo no painel, em
            Configurações.
          </p>
        )}
      </div>
    </div>
  );
}
