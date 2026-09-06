/**
 * Colour families — turns the store's raw colour attribute values into a short,
 * shoppable facet.
 *
 * The WooCommerce catalogue holds ~86 distinct colour strings across a 60-product
 * sample, and they are not clean:
 *
 *   placeholders   "Color 1" … "Color 20", "Variant 2"   (not colours at all)
 *   case dupes     "Pink" / "pink", "Green" / "green"
 *   misspellings   "Levander", "Meroon", "Marron", "Sku Blue"
 *   shades         "Dark Green", "Rust Orange", "Royal Black", "Light Lavender"
 *   compounds      "Red&Green", "Pink&Red"
 *   regional names "Onion", "Chiku", "Soil", "Rama", "Coffee"
 *
 * Everything here maps onto ~15 parent colours so the filter stays usable.
 * A compound value belongs to every family it names, so "Red&Green" shows up
 * under both Red and Green.
 *
 * Order matters: the first family whose pattern matches a token wins, so the
 * more specific families are listed before the generic ones. That is why
 * Maroon precedes Red ("Reddish Maroon" → Maroon) and Orange precedes Brown
 * ("Rust Orange" → Orange).
 */

export interface ColorFamily {
  /** Display name shown on the filter chip. */
  name: string;
  /** Swatch colour for the chip. */
  hex: string;
  /** Matched against a lowercased, trimmed token. */
  pattern: RegExp;
}

export const COLOR_FAMILIES: ColorFamily[] = [
  { name: "Maroon", hex: "#800000", pattern: /maroon|meroon|marron/ },
  { name: "Wine", hex: "#722F37", pattern: /wine|burgundy/ },
  { name: "Lavender", hex: "#B39DDB", pattern: /lavender|levander/ },
  { name: "Cream", hex: "#F0E4D0", pattern: /cream|beige|ivory|off.?white/ },
  { name: "White", hex: "#FFFFFF", pattern: /white/ },
  { name: "Black", hex: "#000000", pattern: /black/ },
  { name: "Grey", hex: "#757575", pattern: /gr[ae]y|silver/ },
  { name: "Pink", hex: "#E91E63", pattern: /pink|onion|rose|peach/ },
  { name: "Purple", hex: "#7B1FA2", pattern: /purple|violet|magenta|grape|jamun/ },
  { name: "Orange", hex: "#F57C00", pattern: /orange|orenge/ },
  { name: "Brown", hex: "#6D4C41", pattern: /brown|coffee|chiku|soil|rust|copper|khaki|mehendi/ },
  { name: "Yellow", hex: "#FBC02D", pattern: /yellow|mustard|gold|lemon/ },
  { name: "Green", hex: "#388E3C", pattern: /green|olive|mint|pista/ },
  { name: "Blue", hex: "#1976D2", pattern: /blue|navy|rama|teal|firozi|sky/ },
  { name: "Red", hex: "#D32F2F", pattern: /red|scarlet|cherry/ },
];

const FAMILY_NAMES = new Set(COLOR_FAMILIES.map((f) => f.name));

/** "Color 14", "Variant 2", "Shade 3" — unnamed variant slots, not colours. */
const PLACEHOLDER = /^(colou?r|variant|shade|design|option)\s*[-_]?\s*\d+$/i;

export const isPlaceholderColor = (raw: string): boolean =>
  !raw || !raw.trim() || PLACEHOLDER.test(raw.trim());

/**
 * Map one raw attribute value to the families it belongs to.
 * Returns [] for placeholders and for colours we don't recognise.
 */
export const colorFamiliesOf = (raw: string): string[] => {
  if (isPlaceholderColor(raw)) return [];

  // "Red&Green", "Pink / Red", "Blue and Gold" → separate tokens.
  const tokens = raw
    .toLowerCase()
    .split(/[&/,+]|\band\b/)
    .map((t) => t.trim())
    .filter(Boolean);

  const found = new Set<string>();
  for (const token of tokens) {
    const family = COLOR_FAMILIES.find((f) => f.pattern.test(token));
    if (family) found.add(family.name);
  }
  return [...found];
};

/** Every family represented by a product's colour attribute. */
export const productColorFamilies = (
  colors: (string | { name?: string })[] | undefined,
): Set<string> => {
  const families = new Set<string>();
  for (const color of colors || []) {
    const raw = typeof color === "string" ? color : color?.name || "";
    for (const family of colorFamiliesOf(raw)) families.add(family);
  }
  return families;
};

export const hexForFamily = (name: string): string =>
  COLOR_FAMILIES.find((f) => f.name === name)?.hex || "#CCCCCC";

/** Keep only names that are real families, in the canonical display order. */
export const sanitiseFamilyNames = (names: string[]): string[] =>
  COLOR_FAMILIES.filter((f) => names.includes(f.name)).map((f) => f.name);

export const isFamilyName = (name: string): boolean => FAMILY_NAMES.has(name);
