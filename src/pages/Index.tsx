import Layout from "@/components/layout/Layout";
import { useMemo, useEffect } from "react";

import HeroBanner from "@/components/home/HeroBanner";
import CategoryCarousel from "@/components/home/CategoryCarousel";
import CategoryGrid from "@/components/home/CategoryGrid";
import ProductSection from "@/components/home/ProductSection";
import StorySection from "@/components/home/StorySection";
import ReviewsSlider from "@/components/home/ReviewsSlider";
import { useWooCommerceProducts, useWooCommerceCategories } from "@/hooks/useWooCommerce";
import { Skeleton } from "@/components/ui/skeleton";
import { preloadImages, getProductCardImage } from "@/lib/imageOptimizer";

const Index = () => {
  // New Arrivals - products tagged "new-arrivals" in WooCommerce
  const { data: newArrivalsData, isLoading: newArrivalsLoading, error: newArrivalsError } = useWooCommerceProducts({
    perPage: 8,
    tag: 'new-arrivals',
    skipVariations: true,
  });

  // Hot Sellers - products tagged "hot-sellers" in WooCommerce
  const { data: hotSellersData, isLoading: hotSellersLoading } = useWooCommerceProducts({
    perPage: 8,
    tag: 'hot-sellers',
    skipVariations: true,
  });

  const { data: categories } = useWooCommerceCategories();

  const newArrivals = newArrivalsData?.products || [];

  const displayHotSellers = hotSellersData?.products || [];

  // Preload critical above-the-fold images (first 4 products) for instant display
  useEffect(() => {
    if (newArrivals.length > 0) {
      const criticalImages = newArrivals
        .slice(0, 4)
        .map(p => p.images[0])
        .filter(Boolean)
        .map(img => img.startsWith("/") || img.startsWith("data:") ? img : getProductCardImage(img));

      if (criticalImages.length > 0) {
        preloadImages(criticalImages).catch(() => {
          // Silently fail - images will load normally
        });
      }
    }
  }, [newArrivals]);

  return (
    <Layout>
      {/* Circular category strip — sits above the hero, as on the reference site */}
      <CategoryCarousel />
      <HeroBanner />
      {/* Categories load independently and show immediately */}
      <CategoryGrid />

      {/* Products section - show products immediately when available */}
      {newArrivalsError ? (
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Failed to load products. Please try again.</p>
        </div>
      ) : (
        <>
          {/* Show New Arrivals immediately when we have products - don't wait for all 8 */}
          {newArrivals.length > 0 ? (
            <ProductSection
              title="New Arrivals"
              emoji="🔥"
              products={newArrivals}
            />
          ) : newArrivalsLoading ? (
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
          ) : null}

          {/* Show Hot Sellers - products tagged "hot-sellers" in WooCommerce */}
          {displayHotSellers.length > 0 ? (
            <ProductSection
              title="Hot Sellers"
              emoji="⚡"
              products={displayHotSellers}
            />
          ) : hotSellersLoading ? (
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
          ) : null}

          <ReviewsSlider />
          <StorySection />
        </>
      )}
    </Layout>
  );
};

export default Index;
