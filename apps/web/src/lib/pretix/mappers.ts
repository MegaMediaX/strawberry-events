/** pretix multilingual dict, e.g. { en: "Title", ar: "العنوان" }. */
export type PretixI18n = Record<string, string>;

/** Map a pretix i18n dict to our titleEn/titleAr pair. */
export function fromI18n(value: PretixI18n): {
  titleEn: string;
  titleAr: string | null;
} {
  const titleEn = value.en ?? Object.values(value)[0] ?? "";
  const titleAr = value.ar ?? null;
  return { titleEn, titleAr };
}

/** Build a pretix i18n dict, omitting Arabic when empty. */
export function toI18n(en: string, ar?: string | null): PretixI18n {
  return ar ? { en, ar } : { en };
}

/** Parse a pretix decimal price string into integer cents. */
export function priceToCents(price: string): number {
  return Math.round(parseFloat(price) * 100);
}

/** Format integer cents as a 2-decimal price string for pretix. */
export function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}
