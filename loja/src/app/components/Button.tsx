import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // The accent is scarce on purpose: only the buy CTA uses it at full strength.
  primary: "bg-accent text-accent-ink hover:bg-accent-hover shadow-cta hover:shadow-cta-strong",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 border border-line",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2",
  danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
};

const BASE =
  "inline-flex items-center justify-center rounded-control font-semibold " +
  "transition-all duration-200 ease-[var(--ease-out-soft)] " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 " +
  "whitespace-nowrap select-none";

interface Common {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  to,
  children,
}: Common & { to: string }) {
  return (
    <Link to={to} className={cn(BASE, VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  );
}
