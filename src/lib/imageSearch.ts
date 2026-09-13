import { getPalette } from "colorthief";
import { COLOR_FAMILIES } from "@/lib/colorFamilies";

/**
 * Photo search — runs entirely in the browser, nothing is uploaded.
 *
 * Color Thief quantises the photo into a small palette; each palette entry is
 * classified into one of the store's colour families (see colorFamilies.ts)
 * by hue / saturation / lightness, and the resulting families drive the same
 * `?color=` filter the collection sidebar uses.
 */

export interface ImageSearchResult {
  /** Colour family names, most dominant first (max 3). */
  colors: string[];
  /** The raw palette hexes that produced them, for the swatch strip. */
  palette: string[];
}

const MAX_EDGE = 600;
const MAX_FAMILIES = 3;

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });

/** Phone photos are 4000px+; quantising a 600px copy is just as accurate and far faster. */
const downsize = (img: HTMLImageElement): HTMLCanvasElement => {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
};

/**
 * HSL → colour family. Neutrals are decided by lightness/saturation first,
 * then hue picks the chromatic family, with lightness splitting the
 * dark/light variants the catalogue distinguishes (Maroon vs Red, Lavender
 * vs Purple). Returns null for skin-tone-ish colours we'd rather not filter on.
 */
export const familyForHsl = (h: number, s: number, l: number): string | null => {
  if (l >= 0.93 && s <= 0.2) return "White";
  if (l <= 0.13) return "Black";
  if (s <= 0.1) return l >= 0.85 ? "White" : "Grey";

  // Warm band: cream, brown, orange — and skin. Light peach/tan is where
  // faces and arms land, and we'd rather miss a peach dupatta than filter
  // every photo of a person by their skin tone.
  if (h >= 12 && h < 40) {
    if (l >= 0.8 && s <= 0.6) return "Cream";
    if (l >= 0.6) return null;
    if (s <= 0.6 || l <= 0.35) return "Brown";
    return "Orange";
  }

  if (h < 12 || h >= 345) {
    if (l <= 0.35) return s <= 0.5 ? "Wine" : "Maroon";
    if (l >= 0.7) return "Pink";
    return "Red";
  }
  if (h < 68) return "Yellow";
  if (h < 165) return "Green";
  if (h < 235) return "Blue";
  if (h < 255) return l >= 0.8 ? "Lavender" : "Blue";
  if (h < 300) return l >= 0.65 ? "Lavender" : "Purple";
  if (h < 330) return l <= 0.35 ? "Wine" : l >= 0.6 ? "Pink" : "Purple";
  // 330–345: magenta → deep wine or pink
  return l <= 0.3 ? "Wine" : "Pink";
};

const KNOWN_FAMILIES = new Set(COLOR_FAMILIES.map((f) => f.name));

export const searchByImage = async (file: File): Promise<ImageSearchResult> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }

  const img = await loadImage(file);
  const canvas = downsize(img);

  // Sample the middle of the frame — the garment — rather than the backdrop.
  const palette = await getPalette(canvas, {
    colorCount: 8,
    quality: 5,
    ignoreWhite: false,
    region: { x: 0.15, y: 0.1, width: 0.7, height: 0.8 },
  });

  if (!palette || palette.length === 0) {
    throw new Error("Couldn't pick out any colours from that photo");
  }

  // Most-covered colour first, so the family list reads as "dominant first"
  // and the family a shopper cares about isn't behind the backdrop.
  const byCoverage = [...palette].sort((a, b) => b.proportion - a.proportion);

  const colors: string[] = [];
  const hexes: string[] = [];
  for (const color of byCoverage) {
    // colorthief reports s and l as percentages
    const { h, s, l } = color.hsl();
    const family = familyForHsl(h, s / 100, l / 100);
    hexes.push(color.hex());
    if (family && KNOWN_FAMILIES.has(family) && !colors.includes(family)) {
      colors.push(family);
      if (colors.length >= MAX_FAMILIES) break;
    }
  }

  if (colors.length === 0) {
    throw new Error("Couldn't match that photo to a colour we stock");
  }

  return { colors, palette: hexes.slice(0, 5) };
};
