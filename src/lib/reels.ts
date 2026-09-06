/**
 * Shop by Reels — the curated strip of Instagram reels on the homepage.
 *
 * ─── HOW TO EDIT ────────────────────────────────────────────────────────────
 * Each entry is one card. Replace the starter entries below with your own:
 *
 *   title  short caption shown on the card
 *   thumb  poster image. Drop a portrait (9:16) JPG into public/reels/ and
 *          reference it as "/reels/your-file.jpg". A product or category
 *          image URL also works.
 *   href   the Instagram reel link. Tapping the card opens it in a new tab.
 *   shop   where SHOP NOW goes — "/product/<id>" or "/collections/<slug>".
 *   video  OPTIONAL. A direct .mp4 URL; if present it plays muted on hover.
 *          Leave it out to show just the poster image.
 *
 * Set REELS to an empty array and the whole section stops rendering.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * NOTE: the entries below are starter content built from the live category
 * list on kayalslifestyle.com, so every `shop` link resolves. The `href`
 * values point at the shop's Instagram profile rather than individual
 * reels — swap in real reel URLs when you have them.
 */

import { SOCIAL_LINKS } from "@/lib/siteContact";

const INSTAGRAM = SOCIAL_LINKS.find((s) => s.name === "Instagram")!.href;

export interface Reel {
  id: string;
  title: string;
  thumb: string;
  href: string;
  shop: string;
  video?: string;
}

export const REELS: Reel[] = [
  {
    id: "best-sellers",
    title: "Best Sellers",
    thumb: "https://kayalslifestyle.com/wp-content/uploads/2026/05/IMG-20260529-WA0204.jpg",
    href: INSTAGRAM,
    shop: "/collections/best-sellers-of-kayalslifestyle",
  },
  {
    id: "sarees",
    title: "Saree Edit",
    thumb: "https://kayalslifestyle.com/wp-content/uploads/2025/02/8.png",
    href: INSTAGRAM,
    shop: "/collections/sarees",
  },
  {
    id: "anarkali",
    title: "Anarkali Suits",
    thumb: "https://kayalslifestyle.com/wp-content/uploads/2025/02/9.png",
    href: INSTAGRAM,
    shop: "/collections/anarkali-suits",
  },
  {
    id: "half",
    title: "Half Sarees & Lehengas",
    thumb: "https://kayalslifestyle.com/wp-content/uploads/2025/02/4.png",
    href: INSTAGRAM,
    shop: "/collections/half-sarees",
  },
  {
    id: "gowns",
    title: "Gowns & Frocks",
    thumb: "https://kayalslifestyle.com/wp-content/uploads/2025/03/f7fb05c74ee2b8901cee66278d344874-1.jpg",
    href: INSTAGRAM,
    shop: "/collections/gowns-frocks",
  },
  {
    id: "kuttyma",
    title: "Kids Wear",
    thumb: "https://kayalslifestyle.com/wp-content/uploads/2026/06/a0b45e010a681afa2741148342f8369d.jpg",
    href: INSTAGRAM,
    shop: "/collections/kuttyma-collections",
  },
];
