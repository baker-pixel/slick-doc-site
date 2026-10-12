export type TierId = "foundation" | "growth" | "transformation";

interface TierPricing {
  price: number;
  priceSuffix: string;
  /** Single-number display for self-serve contexts that can't show a range. */
  startingAt: number;
}

// Prices mirror the Stripe subscription prices (the amount clients are charged).
export const pricingData: Record<TierId, TierPricing> = {
  foundation: { price: 249, priceSuffix: "", startingAt: 249 },
  growth: { price: 599, priceSuffix: "", startingAt: 599 },
  transformation: { price: 799, priceSuffix: "", startingAt: 799 },
};

export function formatPriceRange(tier: TierId): string {
  const { price, priceSuffix } = pricingData[tier];
  return `$${price}${priceSuffix}`;
}
