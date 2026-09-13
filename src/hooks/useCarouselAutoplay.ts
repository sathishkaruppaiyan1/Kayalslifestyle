import { useEffect, useMemo, useState } from "react";
import Autoplay from "embla-carousel-autoplay";

/**
 * Autoplay for the embla carousels (category strip, reels, product rails).
 *
 * Behaviour:
 *   • pauses while the pointer is over the carousel, so a shopper reading a
 *     card or hovering a reel is never yanked along;
 *   • keeps going after a swipe rather than dying on first touch, which is
 *     what stopOnInteraction: true would do;
 *   • turns itself off entirely for visitors who ask for reduced motion.
 *     Auto-advancing content that cannot be paused fails WCAG 2.2.2, and
 *     hover-to-pause is not available on touch.
 *
 * Pass the result straight to <Carousel plugins={...}>. Autoplay needs
 * `loop: true` in the carousel opts to keep running past the last slide.
 *
 * `stopOnInteraction: true` is for strips a shopper actively flicks through
 * (the category scroller): once they touch it, it stays put instead of
 * lurching on a few seconds later mid-swipe.
 */
export const useCarouselAutoplay = (delay = 4000, { stopOnInteraction = false } = {}) => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return useMemo(
    () =>
      reducedMotion
        ? []
        : [Autoplay({ delay, stopOnInteraction, stopOnMouseEnter: true })],
    [delay, reducedMotion, stopOnInteraction],
  );
};
