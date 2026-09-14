import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { X, CircleNotch } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/contexts/SearchContext";
import { useWooCommerceProducts } from "@/hooks/useWooCommerce";
import { useVoiceSearch } from "@/hooks/useVoiceSearch";
import { searchByImage } from "@/lib/imageSearch";
import {
  fetchProductCards,
  loadCatalogIndex,
  preloadVisualSearch,
  rankBySimilarity,
  resolveThumbnails,
  searchCatalog,
} from "@/lib/visualSearch";
import type { Product } from "@/types/product";
import { COLOR_FAMILIES, hexForFamily, productColorFamilies } from "@/lib/colorFamilies";
import SearchModeButtons from "./SearchModeButtons";

const AdornSearch = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="10" cy="10" r="7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 15L21 21" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface PhotoState {
  previewUrl: string;
  /**
   * "catalog": matched against the whole-store image index (plugin ≥ 1.4).
   * "colour": no index yet — colour-narrow a page of products, then rank.
   */
  mode: "catalog" | "colour";
  /** Look-alike products from the index, best first (catalog mode). */
  matches: Product[];
  /** Families detected in the photo, dominant first. */
  detected: string[];
  /** Raw palette swatches shown next to the thumbnail. */
  palette: string[];
  /** Families currently applied — shopper can toggle detected ones off. */
  selected: string[];
  /** Downsized photo for the similarity model. */
  canvas: HTMLCanvasElement;
}

interface VisualRank {
  /** product id → similarity score; products missing here couldn't be analysed. */
  scores: Map<string, number>;
  done: number;
  total: number;
  running: boolean;
}

const RESULT_LIMIT = 8;
const CATALOG_RESULT_LIMIT = 12;
// How many to pull when we filter by colour on the client; the catalogue has
// ~15 families so a page of 48 leaves enough per colour to fill the grid.
const PHOTO_FETCH_SIZE = 48;
// Below this many colour matches the colour filter is too tight to be useful,
// so similarity ranks the whole fetched page instead.
const MIN_COLOR_CANDIDATES = 4;
const NO_COLORS: string[] = [];

const SearchModal = () => {
  const { isOpen, closeSearch, query, setQuery, launch, clearLaunch } = useSearch();
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [visual, setVisual] = useState<VisualRank | null>(null);
  const rankRun = useRef(0); // ignore results from a superseded ranking run

  const voice = useVoiceSearch({
    onTranscript: (text) => setQuery(text),
  });

  const photoColors = photo?.selected ?? NO_COLORS;
  const hasPhoto = photo !== null;
  const hasTextQuery = debouncedQuery.length >= 2;
  const canSearch = hasTextQuery || hasPhoto;

  const catalogMode = photo?.mode === "catalog";
  const { data, isLoading: fetching } = useWooCommerceProducts({
    search: hasTextQuery ? debouncedQuery : undefined,
    perPage: hasPhoto ? PHOTO_FETCH_SIZE : RESULT_LIMIT,
    skipVariations: hasPhoto, // colour attributes still come through on the fast path
    enabled: canSearch && !(catalogMode && !hasTextQuery),
  });
  const isLoading = fetching && !(catalogMode && !hasTextQuery);

  // Stage 1: colour narrows the page of products to candidates.
  const candidates = useMemo(() => {
    if (!canSearch) return [];
    const all = data?.products || [];
    if (photoColors.length === 0) return all;
    const wanted = new Set(photoColors);
    const matching = all.filter((p) => {
      for (const family of productColorFamilies(p.colors)) {
        if (wanted.has(family)) return true;
      }
      return false;
    });
    return matching.length >= MIN_COLOR_CANDIDATES ? matching : all;
  }, [data, canSearch, photoColors]);

  // Colour mode only: rank the colour-narrowed candidates by similarity.
  useEffect(() => {
    if (!photo || photo.mode !== "colour" || candidates.length === 0) {
      setVisual(null);
      return;
    }
    const run = ++rankRun.current;
    setVisual({ scores: new Map(), done: 0, total: candidates.length, running: true });
    resolveThumbnails(candidates.map((p) => p.id))
      .then((thumbs) =>
        rankBySimilarity(
          photo.canvas,
          candidates
            .map((p) => ({ id: p.id, imageUrl: thumbs[p.id] || p.images[0] }))
            .filter((c) => !!c.imageUrl),
          (done, total) => {
            if (run === rankRun.current) setVisual((v) => (v ? { ...v, done, total } : v));
          },
        ),
      )
      .then((ranked) => {
        if (run !== rankRun.current) return;
        setVisual({
          scores: new Map(ranked.filter((r) => r.score > 0).map((r) => [r.id, r.score])),
          done: ranked.length,
          total: ranked.length,
          running: false,
        });
      })
      .catch((err) => {
        console.warn("Visual ranking unavailable, showing colour matches:", err);
        if (run === rankRun.current) setVisual(null);
      });
  }, [photo, candidates]);

  const products = useMemo(() => {
    if (!photo) return candidates.slice(0, RESULT_LIMIT);
    // Whole-catalogue matches, unless the shopper typed something — then text wins.
    if (photo.mode === "catalog") return hasTextQuery ? candidates.slice(0, RESULT_LIMIT) : photo.matches.slice(0, CATALOG_RESULT_LIMIT);
    if (!visual || visual.scores.size === 0) return candidates.slice(0, RESULT_LIMIT);
    return [...candidates]
      .map((p, index) => ({ p, index, score: visual.scores.get(p.id) ?? -1 }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, RESULT_LIMIT)
      .map(({ p }) => p);
  }, [photo, candidates, visual, hasTextQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const clearPhoto = useCallback(() => {
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setPhotoError(null);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setPhotoError(null);
    setIsAnalysing(true);
    preloadVisualSearch(); // start fetching the model while colours are extracted
    const previewUrl = URL.createObjectURL(file);
    try {
      const [result, index] = await Promise.all([searchByImage(file), loadCatalogIndex()]);

      // Whole-catalogue match when the store has built its image index.
      let matches: Product[] = [];
      let mode: PhotoState["mode"] = "colour";
      if (index) {
        try {
          const top = await searchCatalog(result.canvas, index, 24);
          matches = await fetchProductCards<Product>(top.map((m) => m.id));
          if (matches.length > 0) mode = "catalog";
        } catch (err) {
          console.warn("Catalogue photo search failed, falling back to colour matching:", err);
        }
      }

      setPhoto((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return {
          previewUrl,
          mode,
          matches,
          detected: result.colors,
          palette: result.palette,
          selected: mode === "catalog" ? [] : result.colors,
          canvas: result.canvas,
        };
      });
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setPhotoError(err instanceof Error ? err.message : "Could not search with that photo");
    } finally {
      setIsAnalysing(false);
    }
  }, []);

  // Header icons open the modal already in voice/photo mode.
  useEffect(() => {
    if (!isOpen || !launch) return;
    if (launch.mode === "voice") voice.start();
    else handleFile(launch.file);
    clearLaunch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, launch]);

  // Closing resets the query (see SearchContext); reset photo + mic too.
  useEffect(() => {
    if (!isOpen) {
      clearPhoto();
      voice.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const toggleColor = (name: string) => {
    setPhoto((prev) => {
      if (!prev) return prev;
      const selected = prev.selected.includes(name)
        ? prev.selected.filter((c) => c !== name)
        : [...prev.selected, name];
      return { ...prev, selected };
    });
  };

  if (!isOpen) return null;

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}`;

  const viewAllHref = (() => {
    const params = new URLSearchParams();
    if (hasTextQuery) params.set("search", query);
    if (photoColors.length > 0) params.set("color", photoColors.join(","));
    return `/collections/all?${params.toString()}`;
  })();

  const showDiscovery = query.length === 0 && !hasPhoto && !isAnalysing;
  const inputError = photoError || voice.error;
  const resultLabel = hasTextQuery
    ? `"${query}"`
    : photoColors.length > 0
      ? photoColors.join(" & ")
      : "your photo";
  const showViewAll = products.length > 0 && !(photo?.mode === "catalog" && !hasTextQuery);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeSearch}
      />

      {/* Modal */}
      <div className="absolute top-0 left-0 right-0 bg-background shadow-xl animate-fade-in">
        <div className="container mx-auto px-4 py-6">
          {/* Search Input */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                <AdornSearch />
              </div>
              <Input
                type="text"
                placeholder={voice.isListening ? "Listening…" : "Search for products..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-14 pl-12 pr-24 text-base border border-border rounded-md focus-visible:ring-0 focus-visible:border-primary"
                autoFocus
              />
              <SearchModeButtons
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onVoice={voice.toggle}
                onPhoto={handleFile}
                voiceSupported={voice.isSupported}
                listening={voice.isListening}
                analysing={isAnalysing}
              />
            </div>
            <button
              onClick={closeSearch}
              className="p-3 hover:bg-muted rounded-full transition-colors"
              aria-label="Close search"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {inputError && (
            <p className="mt-2 text-sm text-destructive" role="alert">{inputError}</p>
          )}

          {/* Photo search summary — thumbnail, its palette, and the colour
              families we matched (tap to toggle) */}
          {photo && (
            <div className="mt-4 flex items-start gap-4 border border-border rounded-md p-3 animate-fade-in">
              <img
                src={photo.previewUrl}
                alt="Your uploaded photo"
                className="h-20 w-16 object-cover rounded-sm bg-muted flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                {photo.mode === "catalog" ? (
                  <>
                    <p className="text-sm font-semibold">Products that look like your photo</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Matched against every product in the store. Type above to search by name instead.
                    </p>
                  </>
                ) : (
                <>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Colours in your photo</p>
                  <span className="flex items-center gap-0.5">
                    {photo.palette.map((hex, i) => (
                      <span
                        key={`${hex}-${i}`}
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {photo.detected.map((name) => {
                    const active = photo.selected.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleColor(name)}
                        aria-pressed={active}
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:border-foreground"
                        }`}
                      >
                        <span
                          className="h-3 w-3 rounded-full border border-black/10"
                          style={{ backgroundColor: hexForFamily(name) }}
                        />
                        {name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {visual?.running ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CircleNotch className="h-3 w-3 animate-spin" />
                      Finding similar styles… {visual.done}/{visual.total}
                    </span>
                  ) : visual && visual.scores.size > 0 ? (
                    "Sorted by how closely they match your photo. Type above to narrow by style."
                  ) : (
                    'Type above to narrow by style, e.g. "kurta" or "saree".'
                  )}
                </p>
                </>
                )}
              </div>
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Remove photo"
                className="p-1.5 hover:bg-muted rounded-full transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Trending & Related Searches (Only if query is empty or to encourage search) */}
          {showDiscovery && (
            <div className="mt-8 space-y-6 animate-fade-in">
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Trending Searches</h3>
                <div className="flex flex-wrap gap-2">
                  {["Kurta Sets", "Lehenga", "Sarees", "Gowns", "Best Sellers"].map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="px-4 py-2 bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
              {/* Shop by colour — deep-links into the archive's colour filter,
                  so search and the sidebar share one mechanism. */}
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Shop by Colour</h3>
                <div className="flex flex-wrap gap-3">
                  {COLOR_FAMILIES.map((c) => (
                    <Link
                      key={c.name}
                      to={`/collections/all?color=${encodeURIComponent(c.name)}`}
                      onClick={closeSearch}
                      title={`Shop ${c.name}`}
                      className="group flex flex-col items-center gap-1.5 w-14"
                    >
                      <span
                        className="h-9 w-9 rounded-full border border-black/10 ring-2 ring-transparent
                                   transition-all group-hover:ring-primary group-hover:-translate-y-0.5"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="text-[11px] text-muted-foreground group-hover:text-brand-ink transition-colors">
                        {c.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Related Searches</h3>
                <div className="flex flex-wrap gap-2">
                  {["Wedding Collection", "Party Wear", "Casual Ethnic", "New Arrivals"].map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="px-4 py-2 border border-border hover:border-foreground text-sm font-medium transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          <div className="mt-6 max-h-[60vh] overflow-auto">
            {isAnalysing ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
                <CircleNotch className="h-8 w-8 animate-spin" />
                <p className="text-sm">Finding similar products…</p>
              </div>
            ) : !canSearch ? (
              <p className="text-center text-muted-foreground py-8">
                {voice.isListening ? "Say what you're looking for" : "Type at least 2 characters to search"}
              </p>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8">
                <CircleNotch className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : products.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No products found for {resultLabel}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {products.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    onClick={closeSearch}
                    className="group"
                  >
                    <div className="aspect-[3/4] bg-muted overflow-hidden">
                      <img
                        src={product.images[0] || "/placeholder.svg"}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 animate-zoom-out"
                      />
                    </div>
                    <div className="mt-2">
                      <h3 className="text-sm font-semibold truncate group-hover:text-brand-ink transition-colors">
                        {product.name}
                      </h3>
                      <p className="price text-sm mt-1">
                        {formatPrice(product.price)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* View All Results — not for catalogue photo matches, which have no list page */}
          {showViewAll && (
            <div className="mt-6 text-center border-t border-border pt-4">
              <Link
                to={viewAllHref}
                onClick={closeSearch}
                className="text-sm font-semibold underline text-brand-ink hover:text-primary transition-colors"
              >
                View all results for {resultLabel}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
