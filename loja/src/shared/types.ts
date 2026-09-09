/**
 * Types shared between the Worker and the front-end.
 *
 * Rule that runs through the whole system: money is always an integer amount of
 * cents. Never a float — floating point rounding on money is the classic source
 * of drift between what the site shows and what the gateway settles.
 */

export type Cents = number;

export const ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "needs_review",
  "delivered",
  "expired",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StatusTone = "accent" | "neutral" | "warn" | "danger";

/**
 * How each status is presented.
 *
 * Lives here rather than in each screen because the storefront and the admin
 * panel must speak the same language — and because the database key
 * ("awaiting_payment") must never reach the user.
 *
 * The labels are Portuguese on purpose: they are content, shown to a Brazilian
 * audience.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, { text: string; tone: StatusTone }> = {
  awaiting_payment: { text: "Aguardando pagamento", tone: "warn" },
  paid: { text: "Pago — na fila de entrega", tone: "accent" },
  needs_review: { text: "Em revisão", tone: "warn" },
  delivered: { text: "Entregue", tone: "neutral" },
  expired: { text: "Expirado", tone: "neutral" },
  cancelled: { text: "Cancelado", tone: "danger" },
  refunded: { text: "Reembolsado", tone: "neutral" },
};

export type Platform = "java" | "bedrock";

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
}

export interface Product {
  id: number;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  descriptionMd: string | null;
  priceCents: Cents;
  /** Struck-through "was" price. Null when there is no sale. */
  originalPriceCents: Cents | null;
  /** ISO 8601. Null when the sale has no end date. */
  saleEndsAt: string | null;
  /** Null means permanent. Used by time-limited VIP ranks. */
  durationDays: number | null;
  imageUrl: string | null;
  giftable: boolean;
  /** Donation product: the buyer picks the amount, at or above `priceCents`. */
  payWhatYouWant: boolean;
  featured: boolean;
  /** Null means unlimited. */
  stock: number | null;
}

export interface OrderItem {
  productId: number;
  name: string;
  priceCents: Cents;
  quantity: number;
  imageUrl: string | null;
}

export interface Order {
  publicId: string;
  nick: string;
  platform: Platform;
  recipientNick: string | null;
  status: OrderStatus;
  totalCents: Cents;
  items: OrderItem[];
  /** The Pix BR Code — what the UI calls "copia e cola". */
  pixBrCode: string | null;
  pixQrBase64: string | null;
  /** ISO 8601 */
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
}

export interface StoreSettings {
  serverName: string;
  serverIp: string | null;
  logoUrl: string | null;
  discordInvite: string | null;
  /** Short phrase like "em até 24 horas", shown on the payment screens. */
  deliveryTime: string;
  deliveryNotice: string;
  /** Markdown for the legal pages, editable from the admin panel. */
  termsMd: string | null;
  refundPolicyMd: string | null;
  /** Empty when Turnstile is not configured. */
  turnstileSiteKey: string | null;
}

/** Error envelope returned by every API route. */
export interface ApiError {
  error: string;
  details?: unknown;
}
