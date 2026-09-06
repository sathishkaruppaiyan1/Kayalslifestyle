import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useHomeBanners } from "@/hooks/useWooCommerce";
import type { HomeBanner } from "@/hooks/useWooCommerce";

const HeroBanner = () => {
  const { data: banners = [], isLoading } = useHomeBanners();
  const [current, setCurrent] = useState(0);

  const goNext = useCallback(() => {
    setCurrent((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  const goPrev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + banners.length) % banners.length);
  }, [banners.length]);

  // Auto-slide every 5 seconds when multiple banners
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(goNext, 5000);
    return () => clearInterval(timer);
  }, [banners.length, goNext]);

  // Reset current if banners change
  useEffect(() => {
    if (current >= banners.length && banners.length > 0) {
      setCurrent(0);
    }
  }, [banners.length, current]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="w-full aspect-[16/7] md:aspect-[16/5] bg-muted animate-pulse" />
    );
  }

  // Fallback if no banners in DB
  if (banners.length === 0) {
    return (
      <div className="w-full">
        <Link to="/collections/all">
          {/* React 18 forwards only the lowercase `fetchpriority` DOM attribute. */}
          <img
            src="/hero-banner.jpg"
            alt="Tradition Meets Everyday You — sarees, lehengas, gowns and salwars"
            className="w-full h-auto object-cover animate-zoom-out"
          />
        </Link>
      </div>
    );
  }

  // Single banner - no controls needed
  if (banners.length === 1) {
    return (
      <div className="w-full">
        <BannerSlide banner={banners[0]} />
      </div>
    );
  }

  // Multiple banners - carousel
  return (
    <div className="w-full relative group">
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {banners.map((banner) => (
            <div key={banner.id} className="w-full flex-shrink-0">
              <BannerSlide banner={banner} />
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={goPrev}
        className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-1.5 md:p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Previous banner"
      >
        <CaretLeft className="w-4 h-4 md:w-5 md:h-5" />
      </button>
      <button
        onClick={goNext}
        className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-1.5 md:p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Next banner"
      >
        <CaretRight className="w-4 h-4 md:w-5 md:h-5" />
      </button>

      {/* Dots indicator */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        {banners.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === current ? "bg-white w-5" : "bg-white/50"
            }`}
            aria-label={`Go to banner ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

const BannerSlide = ({ banner }: { banner: HomeBanner }) => {
  const isExternal = banner.redirect_link.startsWith("http");

  const image = (
    <picture>
      {banner.mobile_image_url && (
        <source media="(max-width: 768px)" srcSet={banner.mobile_image_url} />
      )}
      {/* React 18 forwards only the lowercase `fetchpriority` DOM attribute. */}
      <img
        src={banner.image_url}
        alt={banner.alt_text || "Banner"}
        className="w-full h-auto object-cover animate-zoom-out"
        loading="eager"
        {...({ fetchpriority: "high" } as Record<string, string>)}
        decoding="sync"
      />
    </picture>
  );

  if (isExternal) {
    return (
      <a href={banner.redirect_link} target="_blank" rel="noopener noreferrer">
        {image}
      </a>
    );
  }

  return <Link to={banner.redirect_link}>{image}</Link>;
};

export default HeroBanner;
