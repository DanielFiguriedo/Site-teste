import { useEffect, useRef, useState } from "react";
import type { Plataforma } from "@shared/types";
import { nickValido, urlAvatar, useJogador } from "../lib/nick";
import { Botao } from "./Botao";
import { cn } from "../lib/cn";

/**
 * Captura do nick.
 *
 * O nick é o dado mais crítico da loja: como a entrega é manual, errar o nick
 * significa item entregue à pessoa errada. Por isso o avatar aparece em tempo
 * real — é a confirmação visual de que o jogador digitou o próprio nome.
 */
export function ModalNick({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { jogador, salvar } = useJogador();
  const [nick, setNick] = useState(jogador?.nick ?? "");
  const [plataforma, setPlataforma] = useState<Plataforma>(jogador?.plataforma ?? "java");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setNick(jogador?.nick ?? "");
    setPlataforma(jogador?.plataforma ?? "java");
    // Foco no campo assim que o modal abre, para dar para digitar direto.
    const t = setTimeout(() => campo.current?.focus(), 50);
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, jogador, aoFechar]);

  if (!aberto) return null;

  const valido = nickValido(nick, plataforma);
  const confirmar = () => {
    if (!valido) return;
    salvar({ nick: nick.trim(), plataforma });
    aoFechar();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-surface-0/80 p-4 backdrop-blur-sm"
      onClick={aoFechar}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-card border border-line-strong bg-surface-1 p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-nick"
      >
        <h2 id="titulo-nick" className="font-display text-xl font-bold">
          Qual é o seu nick?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          É para esse nome que os itens vão ser entregues. Confira com atenção.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-surface-inset">
            {valido ? (
              <img src={urlAvatar(nick.trim(), 56)} alt="" className="h-full w-full" />
            ) : (
              <span className="text-xs text-ink-faint">?</span>
            )}
          </div>

          <input
            ref={campo}
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmar()}
            placeholder="SeuNick"
            autoComplete="off"
            spellCheck={false}
            aria-label="Nick do jogador"
            className={cn(
              "h-14 w-full rounded-control border bg-surface-inset px-4",
              "font-display text-lg font-semibold text-ink placeholder:text-ink-faint",
              "outline-none transition-colors",
              nick && !valido ? "border-danger" : "border-line focus:border-accent",
            )}
          />
        </div>

        {nick && !valido && (
          <p className="mt-2 text-xs text-danger">
            {plataforma === "java"
              ? "O nick do Java tem de 3 a 16 caracteres: letras, números e _ apenas."
              : "O nick do Bedrock tem de 3 a 20 caracteres."}
          </p>
        )}

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Plataforma
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["java", "bedrock"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlataforma(p)}
                className={cn(
                  "h-11 rounded-control border text-sm font-semibold capitalize transition-colors",
                  plataforma === p
                    ? "border-accent bg-accent/12 text-accent"
                    : "border-line bg-surface-2 text-ink-muted hover:text-ink",
                )}
              >
                {p === "java" ? "Java" : "Bedrock"}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 flex gap-2">
          <Botao variante="secundario" className="flex-1" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao className="flex-1" disabled={!valido} onClick={confirmar}>
            Confirmar
          </Botao>
        </div>
      </div>
    </div>
  );
}
