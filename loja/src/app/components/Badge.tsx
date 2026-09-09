import type { ReactNode } from "react";
import type { StatusTone } from "@shared/types";
import { cn } from "../lib/cn";

const TONES: Record<StatusTone, string> = {
  accent: "bg-accent/15 text-accent border-accent/25",
  neutral: "bg-surface-3 text-ink-muted border-line",
  warn: "bg-warn/15 text-warn border-warn/25",
  danger: "bg-danger/15 text-danger border-danger/25",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5",
        "text-[0.6875rem] font-semibold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
