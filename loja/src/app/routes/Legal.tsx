import { useLoja } from "../lib/loja-context";
import { Markdown } from "../components/Markdown";

/**
 * Termos de uso e política de reembolso.
 *
 * O conteúdo é editado no painel: o dono precisa poder ajustar sem depender de
 * um deploy, e no Brasil essas duas páginas são esperadas numa loja online
 * (o CDC dá direito de arrependimento em 7 dias na compra à distância).
 */
export function PaginaLegal({
  titulo,
  chave,
}: {
  titulo: string;
  chave: "termos_md" | "reembolso_md";
}) {
  const { config } = useLoja();
  const texto = chave === "termos_md" ? config?.termosMd : config?.reembolsoMd;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-12">
      <h1 className="font-display text-3xl font-extrabold">{titulo}</h1>

      <div className="mt-6 rounded-card border border-line bg-surface-1 p-6">
        {texto ? (
          <Markdown texto={texto} nivel={2} />
        ) : (
          <p className="text-sm leading-relaxed text-ink-muted">
            Este texto ainda não foi preenchido. A equipe da loja pode escrevê-lo no painel,
            em Configurações.
          </p>
        )}
      </div>
    </div>
  );
}
