---
name: design-system
description: Tokens, components and visual rules of the store. ALWAYS use before creating or changing any screen, component or style — including a "quick tweak" to a colour, spacing or type.
---

# Store design system

Direction: **premium dark gaming, clean**. Depth comes from the surface scale,
not from putting a border on everything. The accent is scarce on purpose.

Tokens live in `loja/src/app/styles/theme.css`, inside Tailwind v4's `@theme`
block. **Never write a colour, radius or shadow value directly in a component** —
if a token is missing, add it to the theme and use it by name.

Remember the language policy: identifiers, comments and class names are English;
the strings a user reads are Portuguese.

## Tokens

| Group | Tokens | Use |
|---|---|---|
| Surface | `surface-0` … `surface-3`, `surface-inset` | 0 is the page ground; it climbs as an element rises. `inset` is for wells (inputs, image areas). |
| Stroke | `line`, `line-strong` | `line` at rest, `line-strong` on hover. |
| Text | `ink`, `ink-muted`, `ink-faint` | Heading / body / secondary label. |
| Accent | `accent`, `accent-hover`, `accent-dim`, `accent-ink`, `accent-glow` | `accent-ink` is the text colour **on top of** the accent. |
| Semantic | `warn`, `danger`, `info` | State, never decoration. |
| Font | `font-display`, `font-sans` | Outfit for headings, Inter for body. |
| Radius | `radius-card`, `radius-control` | Card and control. |
| Shadow | `shadow-card`, `shadow-lift`, `shadow-cta`, `shadow-cta-strong` | Rest, hover, and the buy button's glow. |

## Rules

**The accent is scarce.** Only three things may use full emerald: the buy CTA,
the price, and the active state (selected tab or filter). If everything glows,
the button that converts stops standing out.

**Minimum AA contrast.** Text over `surface-0`/`surface-1` uses `ink` or
`ink-muted`. `ink-faint` is for a short, non-essential label only — never for
text the user must read to decide on a purchase.

**Prices use `.tabular`.** Without `font-variant-numeric: tabular-nums` a column
of prices jitters as digit widths change.

**Hover is elevation, not a colour swap.** Card: `-translate-y-1` +
`shadow-lift` + `line-strong`, 200–300ms with `--ease-out-soft`.

**Focus state is never removed.** The global `:focus-visible` handles it; do not
override with `outline-none` without putting something visible back. Note the
pay-what-you-want field, where the ring lives on the wrapper via
`focus-within:border-accent`.

**Every animation respects `prefers-reduced-motion`** — already handled globally
in `@layer base`; do not add JS animation that ignores it.

## Canonical components

Reuse, do not recreate:

- `components/Button.tsx` — `Button` and `ButtonLink`, variants
  `primary` | `secondary` | `ghost` | `danger`, sizes `sm` | `md` | `lg`.
  Irreversible actions use `danger` plus a confirmation step.
- `components/Badge.tsx` — short labels, tones from `StatusTone`.
- `components/Chip.tsx` — `ChipLink` and `ChipButton` for filters.
- `components/ProductCard.tsx` — product card and its loading skeleton.
- `components/PlayerAvatar.tsx` — the player head, with a fallback when the
  third-party service fails.
- `components/Icons.tsx` — inline SVG. A handful of icons does not justify a
  library; add the new one here, same style (1.6 stroke, 24×24, `aria-hidden`).
- `components/Markdown.tsx` — safe renderer; takes a `level` so headings never
  skip from `h1` to `h3`.
- `lib/modal.ts` — `useModal`: Escape, initial focus, focus trap, focus restore.
  Every dialog uses it.
- `lib/cn.ts` — class joining.

Status labels come from `ORDER_STATUS_LABELS` in `@shared/types`. Never render a
database key such as `awaiting_payment` to the user.

## Loading, empty and error

Every list needs three states: a **skeleton with the same silhouette** as the
real content (the layout must not jump), an **empty state with a sentence in
Portuguese**, and an **error state** — a `fetch` inside a component always needs
`try/catch/finally`, or a network failure leaves the screen on the skeleton
forever.

## Accessibility

- `aria-label` on any icon-only button, `aria-hidden` on decorative SVG.
- Invalid fields get `aria-invalid` plus `aria-describedby` pointing at a
  message: colour alone is not an indicator.
- Errors that matter announce themselves with `role="alert"`; a screen that
  changes on its own (the payment one) wraps the swap in `role="status"`.
- Toggle groups use `aria-pressed`; the active filter uses `aria-current`.

## Responsive

Mobile first: most players buy on a phone, with the banking app on the same
device. Product grid: 1 column → `sm:` 2 → `lg:` 4. On buying screens the main
CTA has to be reachable without scrolling — on the product page the purchase
panel is `order-first` below `lg` for exactly that reason.
