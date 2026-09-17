import { useQuery } from "@tanstack/react-query";
import type { Category, Product } from "@/types/product";

/**
 * Homepage layout from the "Kayals Homepage Builder" WordPress plugin
 * (wordpress/kayals-homepage). Sections come back already ordered and
 * resolved: categories as objects, product rails as ordered ID lists.
 *
 * Returns `null` when the plugin isn't installed or WordPress is unreachable,
 * so Index.tsx can fall back to its built-in layout.
 */

export interface HomepageCategory extends Category {
  count?: number;
}

export interface HeroItem {
  image: string;
  mobile_image: string;
  link: string;
  alt: string;
}

export interface ReelItem {
  title: string;
  thumb: string;
  href: string;
  shop: string;
  video: string;
}

export interface ReviewItem {
  image: string;
  caption: string;
}

/**
 * Founder story (plugin ≥ 1.6). `intro` and `more` are HTML written in the
 * WordPress editor and run through wp_kses_post server-side — the same
 * treatment product descriptions and CMS pages already get.
 */
export interface StoryContent {
  title: string;
  subtitle: string;
  image: string;
  image_alt: string;
  name: string;
  role: string;
  intro: string;
  more: string;
  read_more: string;
  read_less: string;
}

interface SectionBase {
  id: string;
  title: string;
}

export type HomepageSection =
  | (SectionBase & { type: "category_strip"; categories: HomepageCategory[] })
  | (SectionBase & { type: "category_tabs"; categories: HomepageCategory[] })
  | (SectionBase & { type: "hero"; items: HeroItem[] })
  | (SectionBase & { type: "reels"; items: ReelItem[] })
  | (SectionBase & { type: "reviews"; items: ReviewItem[] })
  | (SectionBase & { type: "story" } & Omit<StoryContent, "title">)
  | (SectionBase & {
      type: "products";
      emoji: string;
      layout: "grid" | "carousel";
      product_ids: number[];
      /** Ready-to-render cards in admin order (plugin ≥ 1.1). */
      products?: Product[];
      view_all: string;
    });

export interface TopbarItem {
  type: "text" | "whatsapp";
  text: string;
  phone: string;
  link: string;
  /** Resolved by the plugin: wa.me link for WhatsApp items, `link` for text ones. */
  url: string;
}

export interface TopbarConfig {
  enabled: boolean;
  items: TopbarItem[];
}

export interface HomepageConfig {
  version: string;
  generated: string;
  /**
   * Section types this plugin version understands. Disabled sections are
   * stripped from `sections`, so this is the only way to tell "switched off"
   * apart from "too old to know about it" — which decides whether the
   * storefront still falls back to its own built-in copy.
   */
  manages?: HomepageSection["type"][];
  /** Announcement strip above the header — global, shown on every page. */
  topbar?: TopbarConfig;
  sections: HomepageSection[];
}

const wpUrl = (import.meta.env.VITE_WORDPRESS_URL as string | undefined)?.replace(/\/+$/, "");

export const useHomepage = () =>
  useQuery({
    queryKey: ["homepage-config", wpUrl],
    queryFn: async (): Promise<HomepageConfig | null> => {
      if (!wpUrl) return null;
      try {
        const res = await fetch(`${wpUrl}/wp-json/kayals/v1/homepage`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return null; // 404 = plugin not active
        const data = (await res.json()) as HomepageConfig;
        return Array.isArray(data?.sections) ? data : null;
      } catch (err) {
        console.warn("Homepage config unavailable, using built-in layout:", err);
        return null;
      }
    },
    staleTime: 0, // cached copy paints instantly, then revalidates so admin edits show on next load
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });
