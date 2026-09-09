/**
 * Inline SVG icons. No external dependency: a handful of icons does not justify
 * a library, and inlining avoids a flash of missing icon.
 */
type Props = { className?: string };

const base = "h-full w-full";

export function CrownIcon({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CoinsIcon({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <ellipse cx="12" cy="7" rx="7" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function BoxIcon({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 7.2L12 11.5l8-4.3M12 11.5V21" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function KeyIcon({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="15.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12.3 11.7L4 20m2.2-2.2l2.2 2.2m-.5-4.4l2.2 2.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InfoIcon({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function CopyIcon({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M15 5.5A2.5 2.5 0 0012.5 3h-7A2.5 2.5 0 003 5.5v7A2.5 2.5 0 005.5 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckIcon({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 12.5l5 5 10-11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UserIcon({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MAP = {
  crown: CrownIcon,
  coins: CoinsIcon,
  package: BoxIcon,
  key: KeyIcon,
  // Also accepts the category slug, so the product card does not need to carry
  // the `icon` column around. Slugs stay Portuguese: they are content.
  vip: CrownIcon,
  cash: CoinsIcon,
  kits: BoxIcon,
  chaves: KeyIcon,
} as const;

/** Category icon, falling back to the box for unknown names. */
export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Component = MAP[name as keyof typeof MAP] ?? BoxIcon;
  return <Component className={className} />;
}
