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

/**
 * Category strip above the hero banner.
 *
 * Each thumbnail is an arch: fully rounded across the top, square at the
 * bottom two corners. `rounded-t-full` on a 2:3 box gets clamped by the
 * browser to a radius of width/2, which is exactly a semicircular top —
 * and unlike a fixed pixel radius it stays correct at every breakpoint.
 *
 * The category name sits below the image so it stays legible over any artwork.
 */
const CategoryCarousel = () => {
  const { data, isLoading } = useWooCommerceCategories();
  const categories = data?.categories || [];

  if (isLoading) {
    return (
      <section className="pt-6 pb-4">
        <div className="container mx-auto px-4">
          <div className="flex gap-3 md:gap-5 overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="shrink-0 basis-1/3 md:basis-1/4 lg:basis-1/6">
                <Skeleton className="aspect-[2/3] w-full rounded-t-full" />
                <Skeleton className="mx-auto mt-2 md:mt-3 h-3 md:h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (categories.length === 0) return null;

  return (
    <section className="pt-6 pb-4">
      <div className="container mx-auto px-4">
        <Carousel opts={{ align: "start", loop: false }} className="w-full">
          <CarouselContent className="-ml-3 md:-ml-5">
            {categories.map((category) => (
              <CarouselItem
                key={category.id}
                className="pl-3 md:pl-5 basis-1/3 md:basis-1/4 lg:basis-1/6"
              >
                <Link to={`/collections/${category.slug}`} className="group block">
                  <div className="aspect-[2/3] w-full overflow-hidden rounded-t-full">
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
                  <h3 className="mt-2 md:mt-3 text-center font-heading text-xs sm:text-sm lg:text-lg font-semibold leading-snug text-[#333] transition-colors group-hover:text-primary">
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
