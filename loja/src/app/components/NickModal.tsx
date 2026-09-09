import { useEffect, useId, useState } from "react";
import type { Platform } from "@shared/types";
import { isValidNick, usePlayer } from "../lib/player";
import { useModal } from "../lib/modal";
import { PlayerAvatar } from "./PlayerAvatar";
import { Button } from "./Button";
import { cn } from "../lib/cn";

/**
 * Nick capture.
 *
 * The nick is the most critical field in the store: because delivery is manual,
 * a wrong nick means the item goes to the wrong person. That is why the avatar
 * updates live — it is the visual confirmation that the player typed their own
 * name.
 */
export function NickModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { player, save } = usePlayer();
  const [nick, setNick] = useState(player?.nick ?? "");
  const [platform, setPlatform] = useState<Platform>(player?.platform ?? "java");
  const box = useModal(open, onClose);
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setNick(player?.nick ?? "");
    setPlatform(player?.platform ?? "java");
  }, [open, player]);

  if (!open) return null;

  const valid = isValidNick(nick, platform);
  const invalid = nick.length > 0 && !valid;

  const confirm = () => {
    if (!valid) return;
    save({ nick: nick.trim(), platform });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-surface-0/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={box}
        className="w-full max-w-md rounded-card border border-line-strong bg-surface-1 p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nick-modal-title"
      >
        <h2 id="nick-modal-title" className="font-display text-xl font-bold">
          Qual é o seu nick?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          É para esse nome que os itens vão ser entregues. Confira com atenção.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-surface-inset">
            {valid ? (
              <PlayerAvatar nick={nick.trim()} size={54} />
            ) : (
              <span className="text-xs text-ink-faint" aria-hidden="true">
                ?
              </span>
            )}
          </div>

          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            placeholder="SeuNick"
            autoComplete="off"
            spellCheck={false}
            aria-label="Nick do jogador"
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={cn(
              "h-14 w-full rounded-control border bg-surface-inset px-4",
              "font-display text-lg font-semibold text-ink placeholder:text-ink-faint",
              "outline-none transition-colors",
              invalid ? "border-danger" : "border-line focus:border-accent",
            )}
          />
        </div>

        {invalid && (
          <p id={errorId} className="mt-2 text-xs text-danger">
            {platform === "java"
              ? "O nick do Java tem de 3 a 16 caracteres: letras, números e _ apenas."
              : "O nick do Bedrock tem de 3 a 20 caracteres."}
          </p>
        )}

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Plataforma
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["java", "bedrock"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPlatform(option)}
                aria-pressed={platform === option}
                className={cn(
                  "h-11 rounded-control border text-sm font-semibold transition-colors",
                  platform === option
                    ? "border-accent bg-accent/12 text-accent"
                    : "border-line bg-surface-2 text-ink-muted hover:text-ink",
                )}
              >
                {option === "java" ? "Java" : "Bedrock"}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" disabled={!valid} onClick={confirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
