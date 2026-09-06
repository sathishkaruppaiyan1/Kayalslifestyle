import { useEffect, useRef, useState } from "react";

/**
 * Fades an element in the first time it scrolls into view.
 *
 * Returns a ref to attach and whether it has been revealed. The observer
 * disconnects after the first hit — sections should not re-animate every time
 * they scroll past, which is distracting on a long homepage.
 *
 * `rootMargin` starts the animation slightly before the element reaches the
 * fold so it is already settling by the time it is properly on screen.
 */
export const useRevealOnScroll = <T extends HTMLElement = HTMLDivElement>(
  options?: { rootMargin?: string; threshold?: number },
) => {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;

    // No observer (old browser, SSR snapshot) — show it rather than hide it.
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: options?.rootMargin ?? "0px 0px -80px 0px",
        threshold: options?.threshold ?? 0.05,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [revealed, options?.rootMargin, options?.threshold]);

  return { ref, revealed };
};
