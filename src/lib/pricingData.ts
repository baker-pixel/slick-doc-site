export type TierId = "foundation" | "growth" | "transformation";

interface TierPricing {
  price: number;
  priceSuffix: string;
  /** Single-number display for self-serve contexts that can't show a range. */
  startingAt: number;
}

export const pricingData: Record<TierId, TierPricing> = {
  foundation: { price: 249, priceSuffix: "", startingAt: 249 },
  growth: { price: 449, priceSuffix: "–549", startingAt: 449 },
  transformation: { price: 799, priceSuffix: "–999", startingAt: 799 },
};

export function formatPriceRange(tier: TierId): string {
  const { price, priceSuffix } = pricingData[tier];
  return `$${price}${priceSuffix}`;
}
