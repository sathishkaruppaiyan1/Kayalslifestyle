/**
 * Size normalisation and ordering for the archive filter.
 *
 * The catalogue is mostly clean — S / M / L / XL / 2XL / 3XL / 4XL / 5XL —
 * but it carries one duplicate spelling: a single product uses "XXL" where 62
 * others use "2XL". Those are the same size and must collapse into one chip.
 *
 * Ordering matters more than it looks: sorting these strings alphabetically
 * yields "2XL, 3XL, 4XL, 5XL, L, M, S, XL", which is meaningless to a shopper.
 * SIZE_ORDER below is the sequence chips are always rendered in.
 */

export const SIZE_ORDER = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "Free Size",
] as const;

const ALIASES: Record<string, string> = {
  XXL: "2XL",
  XXXL: "3XL",
  XXXXL: "4XL",
  XXXXXL: "5XL",
  "EXTRA SMALL": "XS",
  SMALL: "S",
  MEDIUM: "M",
  LARGE: "L",
  "EXTRA LARGE": "XL",
  FREESIZE: "Free Size",
  "FREE SIZE": "Free Size",
  FREE: "Free Size",
  ONESIZE: "Free Size",
  "ONE SIZE": "Free Size",
};

const ORDER_INDEX = new Map<string, number>(SIZE_ORDER.map((s, i) => [s, i]));

/** Canonical label for a raw size value, or null if it isn't a size we show. */
export const normaliseSize = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const key = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!key) return null;

  const aliased = ALIASES[key];
  if (aliased) return aliased;

  // Already canonical (compare case-insensitively against SIZE_ORDER).
  const match = SIZE_ORDER.find((s) => s.toUpperCase() === key);
  return match ?? raw.trim();
};

/** Every canonical size a product offers. */
export const productSizes = (sizes: string[] | undefined): Set<string> => {
  const out = new Set<string>();
  for (const s of sizes || []) {
    const n = normaliseSize(s);
    if (n) out.add(n);
  }
  return out;
};

/**
 * Sort canonical sizes into wearing order. Anything not in SIZE_ORDER (an
 * unexpected value from WooCommerce) sorts to the end, alphabetically, so it
 * still shows rather than silently disappearing.
 */
export const sortSizes = (sizes: string[]): string[] =>
  [...sizes].sort((a, b) => {
    // Look up the canonical form, so casing variants that appear in real
    // catalogues ("3Xl", "xxl") still sort into the right slot rather than
    // falling through to the alphabetical tail.
    const ia = ORDER_INDEX.get(normaliseSize(a) ?? a);
    const ib = ORDER_INDEX.get(normaliseSize(b) ?? b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
  });
