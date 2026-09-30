// Share-preview helpers for the product page's og:/twitter: meta tags.

const FALLBACK_DESCRIPTION =
  "Premium dresses at Kayalslifestyle Boutique — sarees, anarkali suits, gowns, lehengas and co-ord sets for women.";

/** WooCommerce descriptions are HTML; share previews want one short plain-text line. */
export const productShareDescription = (shortDescription?: string, description?: string, maxLength = 160) => {
  const toText = (html?: string) => {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  };

  const text = toText(shortDescription) || toText(description);
  if (!text) return FALLBACK_DESCRIPTION;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).replace(/\s+\S*$/, "") + "…";
};

/** Crawlers need absolute image URLs; WooCommerce sometimes returns relative ones. */
export const toAbsoluteUrl = (url: string) => {
  if (!url) return "";
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
};
