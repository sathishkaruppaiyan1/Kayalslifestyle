import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import ProductCarousel from "@/components/home/ProductCarousel";
import { useWooCommerceCategories, useWooCommerceProducts } from "@/hooks/useWooCommerce";

/**
 * Category tabs + product carousel.
 *
 * Tabs come straight from WooCommerce, so a new category appears here on its
 * own. Selecting one fetches that category's products into the shared
 * ProductCarousel below. React Query caches per category, so flicking back to
 * a tab you have already opened is instant.
 *
 * The tab row scrolls horizontally rather than wrapping — with 12 categories a
 * wrapping row would push the products a long way down the page.
 */

/** Catch-all category that mirrors the whole catalogue; not a useful tab. */
const EXCLUDED_SLUGS = new Set(["all-products"]);

const HOW_MANY = 12;

const CategoryTabsCarousel = () => {
  const { data: categoriesData, isLoading: categoriesLoading } = useWooCommerceCategories();

  const categories = useMemo(
    () => (categoriesData?.categories || []).filter((c) => !EXCLUDED_SLUGS.has(c.slug)),
    [categoriesData],
  );

  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  // Default to the first category once they arrive.
  useEffect(() => {
    if (!activeSlug && categories.length > 0) setActiveSlug(categories[0].slug);
  }, [activeSlug, categories]);

  const active = categories.find((c) => c.slug === activeSlug);

  const { data, isLoading, isFetching } = useWooCommerceProducts({
    category: active?.id?.toString(),
    perPage: HOW_MANY,
    skipVariations: true,
    enabled: !!active?.id,
  });

  const products = data?.products || [];

  if (!categoriesLoading && categories.length === 0) return null;

  return (
    <section className="py-10 lg:py-14 bg-muted">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center text-center mb-6">
          <h2 className="section-title rule-gold">Browse by Category</h2>
        </div>

        {/* Tab row — scrolls sideways instead of wrapping. */}
        <div className="mb-2 flex gap-2 overflow-x-auto scrollbar-none pb-2">
          {categoriesLoading
            ? [...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-full" />
              ))
            : categories.map((cat) => {
                const isActive = cat.slug === activeSlug;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveSlug(cat.slug)}
                    aria-pressed={isActive}
                    className={`shrink-0 rounded-full border px-4 py-2 text-[13px] font-semibold
                                transition-colors ${
                                  isActive
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background text-muted-foreground hover:border-primary hover:text-brand-ink"
                                }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
        </div>
      </div>

      {/* The rail itself; heading lives above so the tabs sit between them. */}
      <ProductCarousel
        products={products}
        isLoading={isLoading || isFetching}
        emptyLabel={`No products in ${active?.name ?? "this category"} yet.`}
        className="py-4 lg:py-6"
      />

      {active && products.length > 0 && (
        <div className="container mx-auto px-4 flex justify-center">
          <Link
            to={`/collections/${active.slug}`}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background
                       px-8 py-3 text-[13px] font-semibold uppercase tracking-wide text-foreground
                       transition-colors hover:border-primary hover:bg-brand-tint hover:text-brand-ink"
          >
            View all {active.name}
          </Link>
        </div>
      )}
    </section>
  );
};

export default CategoryTabsCarousel;
