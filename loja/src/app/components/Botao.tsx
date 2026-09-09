import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../lib/cn";

type Variante = "primario" | "secundario" | "fantasma";
type Tamanho = "sm" | "md" | "lg";

const VARIANTES: Record<Variante, string> = {
  // O acento é escasso de propósito: só o CTA de compra o usa cheio.
  primario:
    "bg-accent text-accent-ink hover:bg-accent-hover shadow-[0_6px_20px_-8px_var(--color-accent-glow)] hover:shadow-[0_10px_28px_-8px_var(--color-accent-glow)]",
  secundario: "bg-surface-2 text-ink hover:bg-surface-3 border border-line",
  fantasma: "text-ink-muted hover:text-ink hover:bg-surface-2",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
};

const BASE =
  "inline-flex items-center justify-center rounded-control font-semibold " +
  "transition-all duration-200 ease-[var(--ease-out-soft)] " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 " +
  "whitespace-nowrap select-none";

interface Comum {
  variante?: Variante;
  tamanho?: Tamanho;
  className?: string;
  children: ReactNode;
}

export function Botao({
  variante = "primario",
  tamanho = "md",
  className,
  ...props
}: Comum & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(BASE, VARIANTES[variante], TAMANHOS[tamanho], className)}
      {...props}
    />
  );
}

export function BotaoLink({
  variante = "primario",
  tamanho = "md",
  className,
  to,
  children,
}: Comum & { to: string }) {
  return (
    <Link to={to} className={cn(BASE, VARIANTES[variante], TAMANHOS[tamanho], className)}>
      {children}
    </Link>
  );
}
