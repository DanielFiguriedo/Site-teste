import type { Category, Product } from "@shared/types";

/** Product images are always served by the Worker from R2. */
export function imageUrl(key: string | null): string | null {
  return key ? `/api/images/${key}` : null;
}

/** Converts a SQLite unix timestamp (seconds) to ISO 8601. */
export function toIso(seconds: number | null): string | null {
  return seconds == null ? null : new Date(seconds * 1000).toISOString();
}

type ProductRow = {
  id: number;
  categoryId: number;
  slug: string;
  name: string;
  shortDescription: string | null;
  descriptionMd: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  saleEndsAt: number | null;
  durationDays: number | null;
  imageKey: string | null;
  giftable: boolean;
  payWhatYouWant: boolean;
  featured: boolean;
  stock: number | null;
};

export function toProduct(row: ProductRow, category: { slug: string; name: string }): Product {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categorySlug: category.slug,
    categoryName: category.name,
    slug: row.slug,
    name: row.name,
    shortDescription: row.shortDescription,
    descriptionMd: row.descriptionMd,
    priceCents: row.priceCents,
    // An original price at or below the current one is not a sale, it is noise.
    originalPriceCents:
      row.originalPriceCents && row.originalPriceCents > row.priceCents
        ? row.originalPriceCents
        : null,
    saleEndsAt: toIso(row.saleEndsAt),
    durationDays: row.durationDays,
    imageUrl: imageUrl(row.imageKey),
    giftable: row.giftable,
    payWhatYouWant: row.payWhatYouWant,
    featured: row.featured,
    stock: row.stock,
  };
}

export function toCategory(row: {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
}): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    position: row.position,
  };
}
