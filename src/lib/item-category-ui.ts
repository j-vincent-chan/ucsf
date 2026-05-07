import type { ItemCategory } from "@/types/database";

/** Values shown in category dropdowns (subset of `ItemCategory`; excludes deprecated `event` / `community_update`). */
export const SELECTABLE_ITEM_CATEGORIES = [
  "paper",
  "award",
  "funding",
  "media",
  "other",
] as const satisfies readonly ItemCategory[];

export type SelectableItemCategory = (typeof SELECTABLE_ITEM_CATEGORIES)[number];

/** Digest / queue chips: `news` is stored as `media` in the database. */
export type DigestCategoryFilterChip = "all" | "paper" | "award" | "funding" | "news" | "other";

export const DIGEST_CATEGORY_FILTER_CHIPS: readonly DigestCategoryFilterChip[] = [
  "all",
  "paper",
  "funding",
  "award",
  "news",
  "other",
];

/** URL + filter dropdowns for `/items` — same as selectable, order fixed for UX. */
export const ITEM_QUEUE_FILTER_CATEGORIES: readonly SelectableItemCategory[] = [
  "paper",
  "award",
  "funding",
  "media",
  "other",
];

export function isCategoryOtherBucket(category: ItemCategory | null): boolean {
  return (
    category == null ||
    category === "other" ||
    category === "event" ||
    category === "community_update"
  );
}

/** Single “Other” option in forms: map legacy / uncategorized into `other` value for the select. */
export function normalizeCategoryForSelect(category: ItemCategory | null): SelectableItemCategory {
  if (isCategoryOtherBucket(category)) return "other";
  if (
    category === "paper" ||
    category === "award" ||
    category === "funding" ||
    category === "media"
  ) {
    return category;
  }
  return "other";
}

export function itemCategoryOptionLabel(cat: SelectableItemCategory): string {
  if (cat === "media") return "News";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

/** Pills and lists: merged Other + News rename. */
export function categoryDisplayLabel(category: ItemCategory | null): string {
  if (isCategoryOtherBucket(category)) return "Other";
  if (category === "media") return "News";
  // Remaining branches are paper | award | funding (non-null).
  if (category === "paper" || category === "award" || category === "funding") {
    return category;
  }
  return "Other";
}

export function digestCategoryChipLabel(chip: DigestCategoryFilterChip): string {
  switch (chip) {
    case "all":
      return "All";
    case "paper":
      return "Papers";
    case "funding":
      return "Funding";
    case "award":
      return "Awards";
    case "news":
      return "News";
    case "other":
      return "Other";
    default:
      return chip;
  }
}

export function matchesDigestCategoryChip(
  category: ItemCategory | null,
  chip: DigestCategoryFilterChip,
): boolean {
  if (chip === "all") return true;
  if (chip === "news") return category === "media";
  if (chip === "other") return isCategoryOtherBucket(category);
  return category === chip;
}
