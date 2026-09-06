import { memo } from "react";
import { X } from "@phosphor-icons/react";
import type { Product, ProductColor, VariationImages } from "@/types/product";
import { getProductCardImage } from "@/lib/imageOptimizer";

/**
 * ColorSwatches — shared colour-variation UI and helpers.
 *
 * The two surfaces deliberately look different, and each keeps the design it
 * has always had:
 *
 *   variant="card"    40x40 chips, up to 4 plus a "+N" counter. Compact enough
 *                     to sit under a product card without crowding the grid.
 *   variant="detail"  80x112 image tiles with a bold selected border and an
 *                     out-of-stock marker. Used on the single product page,
 *                     where the column is wide enough to show the garment.
 *
 * They share this module so the colour map and the stock lookup exist once.
 */

// Common colour name -> hex, for products whose attributes carry no swatch image.
export const colorNameToHex: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  blue: "#0000FF",
  green: "#008000",
  yellow: "#FFFF00",
  purple: "#800080",
  pink: "#FFC0CB",
  orange: "#FFA500",
  brown: "#A52A2A",
  gray: "#808080",
  grey: "#808080",
  navy: "#000080",
  maroon: "#800000",
  beige: "#F5F5DC",
  cream: "#FFFDD0",
  gold: "#FFD700",
  silver: "#C0C0C0",
  wine: "#722F37",
  teal: "#008080",
  coral: "#FF7F50",
  peach: "#FFCBA4",
  lavender: "#E6E6FA",
  mint: "#98FF98",
  olive: "#808000",
  burgundy: "#800020",
  mustard: "#FFDB58",
  rust: "#B7410E",
  grape: "#6F2DA8",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
};

const isProductColor = (color: ProductColor | string): color is ProductColor =>
  typeof color === "object" && color !== null && "hex" in color;

export const getColorName = (color: ProductColor | string): string =>
  isProductColor(color) ? color.name : color;

export const getColorHex = (color: ProductColor | string): string => {
  if (isProductColor(color) && color.hex) return color.hex;
  return colorNameToHex[getColorName(color).toLowerCase()] || "#CCCCCC";
};

const normalise = (value: string | undefined) => (value || "").trim().toLowerCase();

/** True when every variation carrying this colour is out of stock. */
export const isColorOutOfStock = (product: Product | undefined, colorName: string): boolean => {
  if (!product?.variations?.length) return false;
  const forColor = product.variations.filter((v) => normalise(v.color) === normalise(colorName));
  if (forColor.length === 0) return false;
  return forColor.every(
    (v) =>
      v.stockStatus === "outofstock" ||
      (v.manageStock && (v.stockQuantity === 0 || v.stockQuantity === null)),
  );
};

const resolveSrc = (url: string) =>
  url.startsWith("/") || url.startsWith("data:") ? url : getProductCardImage(url);

interface ColorSwatchesProps {
  colors: (ProductColor | string)[];
  variationImages?: VariationImages[];
  selected: string | null;
  onSelect: (colorName: string | null) => void;
  variant?: "card" | "detail";
  /** Product used to resolve per-colour stock. "detail" only. */
  product?: Product;
  /** Render the label in the error state when the shopper hasn't chosen yet. */
  invalid?: boolean;
  /** Cap the tiles and show a "+N" counter. "card" only. */
  max?: number;
  className?: string;
}

const ColorSwatches = memo(
  ({
    colors,
    variationImages,
    selected,
    onSelect,
    variant = "card",
    product,
    invalid = false,
    max = 4,
    className = "",
  }: ColorSwatchesProps) => {
    if (!colors || colors.length === 0) return null;

    const findImage = (colorName: string) =>
      variationImages?.find((v) => normalise(v.color) === normalise(colorName))?.images?.[0];

    // ---------------------------------------------------------------- card --
    if (variant === "card") {
      const visible = colors.slice(0, max);
      const overflow = colors.length - visible.length;

      return (
        <div className={`flex justify-center gap-2 w-full ${className}`}>
          {visible.map((color, index) => {
            const colorName = getColorName(color);
            const isSelected = normalise(selected || "") === normalise(colorName);
            const variationImage = findImage(colorName);

            return (
              <button
                key={index}
                type="button"
                title={colorName}
                aria-pressed={isSelected}
                aria-label={colorName}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(isSelected ? null : colorName);
                }}
                className={`w-10 h-10 rounded-md overflow-hidden transition-all ${
                  isSelected ? "border-2 border-black" : "border border-border hover:border-black"
                }`}
              >
                {variationImage ? (
                  <img
                    src={resolveSrc(variationImage)}
                    alt={colorName}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover border-2 border-white"
                  />
                ) : (
                  <div className="w-full h-full" style={{ backgroundColor: getColorHex(color) }} />
                )}
              </button>
            );
          })}

          {overflow > 0 && (
            <span className="text-xs text-muted-foreground self-center ml-1 font-bold">
              +{overflow}
            </span>
          )}
        </div>
      );
    }

    // -------------------------------------------------------------- detail --
    return (
      <div className={className}>
        <div className="flex justify-between items-center mb-3">
          <p className={`text-sm font-medium ${invalid ? "text-destructive" : ""}`}>
            Color
            {selected && <span className="capitalize font-bold text-brand-ink">: {selected}</span>}
            {invalid && <span className="ml-2 text-destructive animate-pulse">(Required)</span>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {colors.map((color, index) => {
            const colorName = getColorName(color);
            const isSelected = normalise(selected || "") === normalise(colorName);
            const variationImage = findImage(colorName);
            const outOfStock = product ? isColorOutOfStock(product, colorName) : false;

            return (
              <button
                key={index}
                type="button"
                title={colorName + (outOfStock ? " (Out of Stock)" : "")}
                aria-pressed={isSelected}
                aria-label={`${colorName}${outOfStock ? " (out of stock)" : ""}`}
                onClick={() => {
                  if (outOfStock) return;
                  onSelect(isSelected ? null : colorName);
                }}
                className={`w-20 h-28 rounded-md border-2 transition-all relative overflow-hidden ${
                  isSelected
                    ? "border-[3px] border-black"
                    : "border-border hover:border-foreground"
                } ${outOfStock ? "opacity-60" : ""}`}
              >
                {variationImage ? (
                  <img
                    src={variationImage}
                    alt={colorName}
                    className="w-full h-full object-cover object-top border-2 border-white"
                  />
                ) : (
                  <div className="w-full h-full" style={{ backgroundColor: getColorHex(color) }} />
                )}

                {outOfStock && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <X className="w-12 h-12 text-black/40 stroke-[1px]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);

ColorSwatches.displayName = "ColorSwatches";

export default ColorSwatches;
