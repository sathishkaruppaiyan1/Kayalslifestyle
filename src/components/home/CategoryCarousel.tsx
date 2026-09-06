import { Link } from "react-router-dom";
import { useWooCommerceCategories } from "@/hooks/useWooCommerce";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";

/**
 * Category strip above the hero banner.
 *
 * Each thumbnail is an arch: fully rounded across the top, square at the
 * bottom two corners. `rounded-t-full` on a 2:3 box gets clamped by the
 * browser to a radius of width/2, which is exactly a semicircular top — and
 * unlike a fixed pixel radius it stays correct at every breakpoint.
 *
 * The arch is capped at 112px wide and centred in its column. Width drives
 * height on a fixed ratio, so the old full-bleed arches at six per row ran to
 * 317px each; capping the width is what keeps the hero above the fold.
 *
 * A soft gold ring turns solid gold, lifts and zooms on hover, so the row
 * reads as navigation rather than decoration.
 */

// Column widths; the arch is capped separately so it never outgrows 112px.
// Tailwind's basis scale has no 1/8 or 1/10, hence the explicit percentages.
const ITEM_BASIS =
  "basis-1/4 sm:basis-1/5 md:basis-1/6 lg:basis-[12.5%] xl:basis-[10%]";

const CategoryCarousel = () => {
  const autoplay = useCarouselAutoplay(4500);
  const { data, isLoading } = useWooCommerceCategories();
  const categories = data?.categories || [];

  if (isLoading) {
    return (
      <section className="pt-5 pb-6">
        <div className="container mx-auto px-4">
          <div className="flex gap-3 md:gap-5 overflow-hidden">
            {[...Array(10)].map((_, i) => (
              <div key={i} className={`shrink-0 ${ITEM_BASIS}`}>
                <Skeleton className="mx-auto aspect-[2/3] w-full max-w-[112px] rounded-t-full" />
                <Skeleton className="mx-auto mt-2.5 h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (categories.length === 0) return null;

  return (
    <section className="pt-5 pb-6">
      <div className="container mx-auto px-4">
        <Carousel opts={{ align: "start", loop: true }}
          plugins={autoplay}
          className="w-full">
          <CarouselContent className="-ml-3 md:-ml-5">
            {categories.map((category) => (
              <CarouselItem key={category.id} className={`pl-3 md:pl-5 ${ITEM_BASIS}`}>
                <Link to={`/collections/${category.slug}`} className="group block">
                  <div
                    className="relative mx-auto aspect-[2/3] w-full max-w-[112px] overflow-hidden
                               rounded-t-full ring-2 ring-brand-tint-strong transition-all duration-300
                               group-hover:-translate-y-0.5 group-hover:ring-primary
                               group-hover:shadow-card-hover"
                  >
                    <img
                      src={category.image}
                      alt={category.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== "/placeholder.svg") {
                          target.src = "/placeholder.svg";
                        }
                      }}
                    />
                  </div>
                  <h3 className="mt-2.5 text-center font-body text-[13px] font-semibold leading-snug text-foreground transition-colors group-hover:text-brand-ink">
                    {category.name}
                  </h3>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious className="hidden lg:flex" />
          <CarouselNext className="hidden lg:flex" />
        </Carousel>
      </div>
    </section>
  );
};

export default CategoryCarousel;
