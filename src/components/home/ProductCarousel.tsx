import { Link } from "react-router-dom";
import ProductCard from "@/components/product/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";
import type { Product } from "@/types/product";

/**
 * A horizontally swipeable row of products.
 *
 * Shares ProductCard with the archive grid, so cards stay identical wherever
 * they appear. Used both as a standalone homepage section and as the body of
 * the category tabs section — which is why the heading is optional.
 */

interface ProductCarouselProps {
  /** Omit to render just the rail, e.g. inside the category tabs. */
  title?: string;
  emoji?: string;
  products: Product[];
  isLoading?: boolean;
  viewAllLink?: string;
  /** Message when the query returns nothing. */
  emptyLabel?: string;
  className?: string;
}

const SLIDE_BASIS = "basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/5";

const ProductCarousel = ({
  title,
  emoji,
  products,
  isLoading = false,
  viewAllLink,
  emptyLabel = "No products to show here yet.",
  className = "",
}: ProductCarouselProps) => {
  const autoplay = useCarouselAutoplay(4000);
  const showSkeletons = isLoading && products.length === 0;

  return (
    <section className={`py-8 lg:py-12 ${className}`}>
      <div className="container mx-auto px-4">
        {title && (
          <div className="relative mb-6 flex flex-col items-center justify-center lg:mb-8">
            <h2 className="section-title rule-gold flex flex-col items-center gap-2 text-center">
              <span className="flex items-center gap-2">
                {title} {emoji && <span>{emoji}</span>}
              </span>
            </h2>

            {viewAllLink && (
              <Link
                to={viewAllLink}
                className="absolute right-0 hidden items-center justify-center rounded-md bg-primary px-6
                           py-2 text-[13px] font-semibold uppercase tracking-wide text-primary-foreground
                           transition-colors hover:bg-brand-ink md:inline-flex"
              >
                View All
              </Link>
            )}
          </div>
        )}

        {showSkeletons ? (
          <div className="flex gap-4 overflow-hidden lg:gap-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`shrink-0 space-y-3 ${SLIDE_BASIS}`}>
                <Skeleton className="aspect-[1/1.5] w-full" />
                <Skeleton className="mx-auto h-4 w-3/4" />
                <Skeleton className="mx-auto h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{emptyLabel}</p>
        ) : (
          <Carousel opts={{ align: "start", loop: true }}
          plugins={autoplay}
          className="w-full">
            <CarouselContent className="-ml-4 lg:-ml-6">
              {products.map((product, index) => (
                <CarouselItem
                  key={`${product.id}-${index}`}
                  className={`pl-4 lg:pl-6 ${SLIDE_BASIS}`}
                >
                  <ProductCard product={product} />
                </CarouselItem>
              ))}
            </CarouselContent>

            <CarouselPrevious className="hidden lg:flex" />
            <CarouselNext className="hidden lg:flex" />
          </Carousel>
        )}

        {viewAllLink && (
          <div className="mt-8 flex justify-center md:hidden">
            <Link
              to={viewAllLink}
              className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3
                         text-[13px] font-semibold uppercase tracking-wide text-primary-foreground
                         transition-colors hover:bg-brand-ink"
            >
              View All
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductCarousel;
