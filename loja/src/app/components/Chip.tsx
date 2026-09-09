import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../lib/cn";

const BASE =
  "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap";

const ESTILO = (ativo: boolean) =>
  ativo
    ? "border-accent bg-accent/12 text-accent"
    : "border-line bg-surface-1 text-ink-muted hover:border-line-strong hover:text-ink";

/**
 * Chip de filtro. O estado ativo é o único caso decorativo em que o acento é
 * permitido — e, justamente por isso, precisa vir sempre daqui, para não haver
 * duas versões do mesmo controle no projeto.
 */
export function ChipLink({
  para,
  ativo,
  children,
}: {
  para: string;
  ativo: boolean;
  children: ReactNode;
}) {
  return (
    <Link to={para} aria-current={ativo ? "page" : undefined} className={cn(BASE, ESTILO(ativo))}>
      {children}
    </Link>
  );
}

export function ChipBotao({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={aoClicar} aria-pressed={ativo} className={cn(BASE, ESTILO(ativo))}>
      {children}
    </button>
  );
}
