import { Fragment } from "react";
import Reveal from "@/components/ui/Reveal";
import { Skeleton } from "@/components/ui/skeleton";
import HeroBanner from "@/components/home/HeroBanner";
import CategoryCarousel from "@/components/home/CategoryCarousel";
import ProductSection from "@/components/home/ProductSection";
import ProductCarousel from "@/components/home/ProductCarousel";
import ShopByReels from "@/components/home/ShopByReels";
import CategoryTabsCarousel from "@/components/home/CategoryTabsCarousel";
import ReviewsSlider from "@/components/home/ReviewsSlider";
import { useWooCommerceProducts } from "@/hooks/useWooCommerce";
import type { HomepageSection } from "@/hooks/useHomepage";
import type { HomeBanner } from "@/hooks/useWooCommerce";
import type { Reel } from "@/lib/reels";

/**
 * Renders the homepage from the WordPress "Homepage Builder" plugin config.
 * Every section maps onto an existing component; the plugin decides order,
 * titles, and content. See useHomepage.ts for the payload shape.
 */

const ProductRail = ({ section }: { section: Extract<HomepageSection, { type: "products" }> }) => {
  const ids = section.product_ids;
  // Plugin ≥ 1.1 ships the cards itself; older payloads only carry IDs, in
  // which case we ask the products function for them (in that order).
  const hasCards = Array.isArray(section.products);
  const { data, isLoading: fetching } = useWooCommerceProducts({
    include: ids.join(","),
    perPage: Math.max(1, ids.length),
    skipVariations: true,
    enabled: !hasCards && ids.length > 0,
  });
  const products = hasCards ? section.products! : data?.products || [];
  const isLoading = !hasCards && fetching;

  if (ids.length === 0) return null;

  if (section.layout === "carousel") {
    return (
      <ProductCarousel
        title={section.title}
        emoji={section.emoji || undefined}
        products={products}
        isLoading={isLoading}
        viewAllLink={section.view_all || undefined}
      />
    );
  }

  if (isLoading && products.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 lg:py-16">
        <div className="flex justify-center mb-8">
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-[300px] w-full rounded-none" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <ProductSection
      title={section.title}
      emoji={section.emoji || undefined}
      products={products}
      viewAllLink={section.view_all || undefined}
    />
  );
};

const renderSection = (section: HomepageSection) => {
  switch (section.type) {
    case "category_strip":
      return <CategoryCarousel categories={section.categories} />;

    case "hero": {
      const banners: HomeBanner[] = section.items.map((b, i) => ({
        id: i,
        image_url: b.image,
        mobile_image_url: b.mobile_image || null,
        redirect_link: b.link || "/collections/all",
        alt_text: b.alt,
        is_active: true,
        display_order: i,
      }));
      return <HeroBanner banners={banners} />;
    }

    case "reels": {
      const reels: Reel[] = section.items.map((r, i) => ({
        id: `${section.id}-${i}`,
        title: r.title,
        thumb: r.thumb,
        href: r.href,
        shop: r.shop || "/collections/all",
        video: r.video || undefined,
      }));
      return (
        <Reveal>
          <ShopByReels reels={reels} title={section.title || "Shop by Reels"} />
        </Reveal>
      );
    }

    case "products":
      return (
        <Reveal>
          <ProductRail section={section} />
        </Reveal>
      );

    case "category_tabs":
      return (
        <Reveal>
          <CategoryTabsCarousel categories={section.categories} title={section.title || "Browse by Category"} />
        </Reveal>
      );

    case "reviews":
      return (
        <Reveal>
          <ReviewsSlider
            images={section.items.map((r, i) => ({ src: r.image, alt: r.caption || `Customer review ${i + 1}` }))}
            title={section.title || "What Our Customers Say"}
          />
        </Reveal>
      );

    default:
      return null;
  }
};

const DynamicHomepage = ({ sections }: { sections: HomepageSection[] }) => (
  <>
    {sections.map((section) => (
      <Fragment key={section.id}>{renderSection(section)}</Fragment>
    ))}
  </>
);

export default DynamicHomepage;
