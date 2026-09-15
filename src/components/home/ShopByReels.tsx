import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";
import { REELS, type Reel } from "@/lib/reels";

/**
 * Shop by Reels — a swipeable strip of autoplaying reels.
 *
 * Each card is 9:16 portrait. The reel video plays automatically (muted,
 * looped, inline — the only form of autoplay browsers permit) and fills the
 * card; there is no poster/thumbnail state. A strip along the bottom shows
 * the product image and caption, and that strip is the link to the product.
 * Tapping the video itself opens the reel on Instagram when a link is set.
 *
 * Cards without a video fall back to the product image as the background so
 * the strip never shows an empty card.
 *
 * Content lives in src/lib/reels.ts or the WordPress homepage builder.
 */
interface ShopByReelsProps {
  /** Reels from the homepage builder; omit to use src/lib/reels.ts. */
  reels?: Reel[];
  title?: string;
}

const ShopByReels = ({ reels = REELS, title = "Shop by Reels" }: ShopByReelsProps = {}) => {
  const autoplay = useCarouselAutoplay(4000);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Only run videos while they are on screen — saves data on mobile and stops
  // a dozen off-screen loops from chewing CPU.
  useEffect(() => {
    const videos = Object.values(videoRefs.current).filter(
      (v): v is HTMLVideoElement => v !== null,
    );
    if (videos.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const v = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            v.play().catch(() => undefined); // autoplay can be refused; ignore
          } else {
            v.pause();
          }
        });
      },
      { threshold: 0.25 },
    );
    videos.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, [reels]);

  if (reels.length === 0) return null;

  return (
    <section className="py-10 lg:py-14 border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center text-center mb-8">
          <h2 className="section-title rule-gold text-xl font-extrabold text-[#6B1F2A] text-center mb-[10px] md:text-2xl">
            {title}
          </h2>
        </div>

        <Carousel
          opts={{ align: "start", loop: true }}
          plugins={autoplay}
          className="w-full"
        >
          <CarouselContent className="-ml-3 md:-ml-4">
            {reels.map((reel) => (
              <CarouselItem
                key={reel.id}
                className="pl-3 md:pl-4 basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5"
              >
                <div
                  className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-muted
                             ring-1 ring-border transition-all duration-300
                             hover:ring-2 hover:ring-primary hover:shadow-card-hover"
                >
                  {reel.video ? (
                    <video
                      ref={(el) => {
                        videoRefs.current[reel.id] = el;
                      }}
                      src={reel.video}
                      className="absolute inset-0 h-full w-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      aria-label={reel.title}
                    />
                  ) : (
                    <img
                      src={reel.thumb}
                      alt={reel.title}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}

                  {/* Tapping the video opens the reel on Instagram. */}
                  {reel.href && (
                    <a
                      href={reel.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Watch ${reel.title} on Instagram`}
                      className="absolute inset-x-0 top-0 bottom-[88px] z-10"
                    />
                  )}

                  {/* Legibility scrim for the product strip. */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                  {/* Product image + caption — this is the link to the product. */}
                  <Link
                    to={reel.shop}
                    aria-label={`Shop ${reel.title}`}
                    className="absolute inset-x-2 bottom-2 z-20 flex items-center gap-2 rounded-md
                               bg-white/90 p-1.5 shadow-sm backdrop-blur-sm transition-colors
                               hover:bg-white"
                  >
                    {reel.thumb && (
                      <img
                        src={reel.thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-14 w-11 shrink-0 rounded object-cover"
                        onError={(e) => {
                          const t = e.target as HTMLImageElement;
                          if (t.src !== window.location.origin + "/placeholder.svg") {
                            t.src = "/placeholder.svg";
                          }
                        }}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold leading-tight text-foreground">
                        {reel.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Shop Now
                      </span>
                    </span>
                  </Link>
                </div>
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

export default ShopByReels;
