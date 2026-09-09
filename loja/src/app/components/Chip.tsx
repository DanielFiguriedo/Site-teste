import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../lib/cn";

const BASE =
  "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap";

const style = (active: boolean) =>
  active
    ? "border-accent bg-accent/12 text-accent"
    : "border-line bg-surface-1 text-ink-muted hover:border-line-strong hover:text-ink";

/**
 * Filter chip. The active state is the one decorative place where the accent is
 * allowed — and precisely because of that it must always come from here, so the
 * project never grows two versions of the same control.
 */
export function ChipLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link to={to} aria-current={active ? "page" : undefined} className={cn(BASE, style(active))}>
      {children}
    </Link>
  );
}

export function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(BASE, style(active))}>
      {children}
    </button>
  );
}
