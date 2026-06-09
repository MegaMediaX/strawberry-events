export type CapacityState = "available" | "filling" | "almost_full" | "sold_out";

/**
 * Classify availability for the capacity bar. A null/zero total means
 * unlimited capacity → always "available".
 */
export function capacityState(sold: number, total: number | null): CapacityState {
  if (!total || total <= 0) return "available";
  const pct = (sold / total) * 100;
  if (pct >= 100) return "sold_out";
  if (pct >= 85) return "almost_full";
  if (pct >= 60) return "filling";
  return "available";
}
