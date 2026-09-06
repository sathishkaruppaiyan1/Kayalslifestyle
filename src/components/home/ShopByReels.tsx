import { useRef } from "react";
import { Link } from "react-router-dom";
import { Play } from "@phosphor-icons/react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";
import { REELS } from "@/lib/reels";

/**
 * Shop by Reels — a swipeable strip of Instagram reels.
 *
 * Each card is 9:16 portrait: poster image, play badge, and a SHOP NOW button
 * that goes to the product or collection. Tapping the card itself opens the
 * reel on Instagram. Where an entry supplies `video`, it plays muted on hover
 * on desktop; touch devices just get the poster, which is the right trade —
 * autoplaying video on mobile burns data and is blocked by most browsers.
 *
 * Content lives in src/lib/reels.ts.
 */
const ShopByReels = () => {
  const autoplay = useCarouselAutoplay(4000);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  if (REELS.length === 0) return null;

  const play = (id: string) => {
    const v = videoRefs.current[id];
    if (v) v.play().catch(() => undefined); // autoplay can be refused; ignore
  };

  const pause = (id: string) => {
    const v = videoRefs.current[id];
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  };

  return (
    <section className="py-10 lg:py-14 border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center text-center mb-8">
          <h2 className="section-title rule-gold">Shop by Reels</h2>
        </div>

        <Carousel opts={{ align: "start", loop: true }}
          plugins={autoplay}
          className="w-full">
          <CarouselContent className="-ml-3 md:-ml-4">
            {REELS.map((reel) => (
              <CarouselItem
                key={reel.id}
                className="pl-3 md:pl-4 basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5"
              >
                <div
                  className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-muted
                             ring-1 ring-border transition-all duration-300
                             hover:ring-2 hover:ring-primary hover:shadow-card-hover"
                  onMouseEnter={() => play(reel.id)}
                  onMouseLeave={() => pause(reel.id)}
                >
                  {/* The whole card opens the reel on Instagram. */}
                  <a
                    href={reel.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Watch ${reel.title} on Instagram`}
                    className="absolute inset-0 z-10"
                  />

                  <img
                    src={reel.thumb}
                    alt={reel.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 animate-zoom-out"
                    onError={(e) => {
                      const t = e.target as HTMLImageElement;
                      if (t.src !== window.location.origin + "/placeholder.svg") {
                        t.src = "/placeholder.svg";
                      }
                    }}
                  />

                  {reel.video && (
                    <video
                      ref={(el) => {
                        videoRefs.current[reel.id] = el;
                      }}
                      src={reel.video}
                      className="absolute inset-0 h-full w-full object-cover opacity-0
                                 transition-opacity duration-300 group-hover:opacity-100"
                      loop
                      muted
                      playsInline
                      preload="none"
                    />
                  )}

                  {/* Legibility scrim for the caption and button. */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent" />

                  <span
                    className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-11 w-11 -translate-x-1/2
                               -translate-y-1/2 items-center justify-center rounded-full bg-white/25
                               backdrop-blur-sm ring-1 ring-white/50 transition-transform duration-300
                               group-hover:scale-110"
                  >
                    <Play weight="fill" className="h-5 w-5 text-white" />
                  </span>

                  <div className="absolute inset-x-3 bottom-3 z-20">
                    <p className="mb-2 truncate text-[13px] font-semibold text-white drop-shadow">
                      {reel.title}
                    </p>
                    <Link
                      to={reel.shop}
                      className="block w-full rounded-md bg-primary py-2 text-center text-[11px]
                                 font-semibold uppercase tracking-wide text-primary-foreground
                                 transition-colors hover:bg-brand-ink"
                    >
                      Shop Now
                    </Link>
                  </div>
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
