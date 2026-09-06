/**
 * Single source of truth for the store's contact and social details.
 *
 * These were previously hardcoded across the footer, promo bar, contact page,
 * thank-you page and the structured data in index.html, which is how three
 * different phone numbers ended up live at once. Import from here instead.
 */

/** Digits only, as entered. */
export const CONTACT_PHONE = "8220020267";

/** E.164 without the +, for wa.me links. */
export const CONTACT_PHONE_INTL = `91${CONTACT_PHONE}`;

export const CONTACT_PHONE_DISPLAY = `+91 ${CONTACT_PHONE}`;

export const CONTACT_EMAIL = "kayalslifestyleboutique@gmail.com";

export const WHATSAPP_URL = `https://wa.me/${CONTACT_PHONE_INTL}`;

export const MAILTO_URL = `mailto:${CONTACT_EMAIL}`;

export const SOCIAL_LINKS = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/kayalslifestyle?igsh=NWozN2g2cWU3cDEz",
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@kayalslifestyle-boutique?si=TQd3LgTR2niRr2o3",
  },
] as const;
