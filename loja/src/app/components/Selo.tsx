import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type Tom = "accent" | "neutro" | "warn" | "danger";

const TONS: Record<Tom, string> = {
  accent: "bg-accent/15 text-accent border-accent/25",
  neutro: "bg-surface-3 text-ink-muted border-line",
  warn: "bg-warn/15 text-warn border-warn/25",
  danger: "bg-danger/15 text-danger border-danger/25",
};

export function Selo({
  tom = "neutro",
  className,
  children,
}: {
  tom?: Tom;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5",
        "text-[0.6875rem] font-semibold uppercase tracking-wide",
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}
