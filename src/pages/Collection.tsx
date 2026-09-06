import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CircleNotch } from "@phosphor-icons/react";
import Layout from "@/components/layout/Layout";
import PageBand from "@/components/layout/PageBand";
import Reveal from "@/components/ui/Reveal";
import WoodmartIcon from "@/components/ui/WoodmartIcon";
import ProductCard from "@/components/product/ProductCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useWooCommerceProductsInfinite, useWooCommerceCategories } from "@/hooks/useWooCommerce";
import { COLOR_FAMILIES, productColorFamilies, sanitiseFamilyNames } from "@/lib/colorFamilies";
import { productSizes, sortSizes } from "@/lib/sizes";

type SortOption = "default" | "price-low" | "price-high" | "newest" | "name-asc" | "name-desc";

const Collection = () => {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  const [showFilters, setShowFilters] = useState(false);
  const [gridView, setGridView] = useState<"grid" | "list">("grid");
  const [priceRange, setPriceRange] = useState({ min: 0, max: 50000 });
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  // The URL is the single source of truth for the colour filter, so a link
  // into ?color=Green applies whether Collection is mounting fresh or already
  // on screen (e.g. tapping a swatch in the search modal from this page).
  const selectedColors = useMemo(
    () => sanitiseFamilyNames((searchParams.get("color") || "").split(",").map((c) => c.trim())),
    [searchParams]
  );

  const selectedSizes = useMemo(
    () => (searchParams.get("size") || "").split(",").map((v) => v.trim()).filter(Boolean),
    [searchParams]
  );

  const { data: categoriesData, isLoading: categoriesLoading } = useWooCommerceCategories();
  const categories = categoriesData?.categories || [];

  // Find the category ID from slug - WooCommerce API requires ID, not slug
  const currentCategory = categories.find(c => c.slug === slug);
  const categoryId = currentCategory?.id?.toString();

  // Skip variations for collection list view - only load when viewing product detail
  // Wait for categories to load before fetching products if we need a category filter
  const shouldFetchProducts = slug === "all" || !!categoryId || !categoriesLoading;
  const {
    data: productsPages,
    isLoading: productsLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useWooCommerceProductsInfinite({
    category: slug === "all" ? undefined : categoryId,
    search: searchQuery,
    perPage: 24, // Load 24 products per page for fast initial load
    skipVariations: true, // Skip variations for faster list loading
    enabled: shouldFetchProducts,
  });

  // Infinite scroll: fetch next page when user scrolls near bottom
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" } // Start loading 400px before user reaches bottom
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all pages into a single products array
  const rawProducts = useMemo(() => {
    return productsPages?.pages?.flatMap(page => page.products) || [];
  }, [productsPages]);

  const isLoading = categoriesLoading || productsLoading;

  // Filter and sort products
  const products = useMemo(() => {
    let filtered = [...rawProducts];

    // Price filter
    filtered = filtered.filter(
      (p) => p.price >= priceRange.min && p.price <= priceRange.max
    );

    // In stock filter
    if (inStockOnly) {
      filtered = filtered.filter((p) => !p.isSoldOut && p.inStock !== false);
    }

    // On sale filter
    if (onSaleOnly) {
      filtered = filtered.filter((p) => p.discount && p.discount > 0);
    }

    // Colour filter — a product matches if it carries ANY selected family.
    if (selectedColors.length > 0) {
      filtered = filtered.filter((p) => {
        const families = productColorFamilies(p.colors);
        return selectedColors.some((c) => families.has(c));
      });
    }

    // Size filter — a product matches if it is offered in ANY selected size.
    if (selectedSizes.length > 0) {
      filtered = filtered.filter((p) => {
        const sizes = productSizes(p.sizes);
        return selectedSizes.some((sz) => sizes.has(sz));
      });
    }

    // Sorting
    switch (sortBy) {
      case "price-low":
        filtered.sort((a, b) => a.price - b.price);
        break;
      case "price-high":
        filtered.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "newest":
        // Assuming newer products have higher IDs
        filtered.sort((a, b) => parseInt(b.id) - parseInt(a.id));
        break;
      default:
        break;
    }

    return filtered;
  }, [rawProducts, priceRange, sortBy, inStockOnly, onSaleOnly, selectedColors, selectedSizes]);

  // Colour chips, with counts, derived from whatever has loaded so far.
  const colorFacet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of rawProducts) {
      for (const family of productColorFamilies(p.colors)) {
        counts.set(family, (counts.get(family) || 0) + 1);
      }
    }
    return COLOR_FAMILIES.filter((f) => counts.has(f.name)).map((f) => ({
      ...f,
      count: counts.get(f.name) || 0,
    }));
  }, [rawProducts]);

  // Size chips, with counts, from whatever has loaded so far.
  const sizeFacet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of rawProducts) {
      for (const size of productSizes(p.sizes)) {
        counts.set(size, (counts.get(size) || 0) + 1);
      }
    }
    return sortSizes([...counts.keys()]).map((name) => ({ name, count: counts.get(name) || 0 }));
  }, [rawProducts]);

  const toggleSize = useCallback(
    (name: string) => {
      const next = new URLSearchParams(searchParams);
      const updated = selectedSizes.includes(name)
        ? selectedSizes.filter((v) => v !== name)
        : [...selectedSizes, name];
      if (updated.length > 0) next.set("size", sortSizes(updated).join(","));
      else next.delete("size");
      setSearchParams(next, { replace: true });
    },
    [searchParams, selectedSizes, setSearchParams]
  );

  const toggleColor = useCallback(
    (name: string) => {
      const next = new URLSearchParams(searchParams);
      const updated = selectedColors.includes(name)
        ? selectedColors.filter((c) => c !== name)
        : [...selectedColors, name];
      if (updated.length > 0) next.set("color", sanitiseFamilyNames(updated).join(","));
      else next.delete("color");
      setSearchParams(next, { replace: true });
    },
    [searchParams, selectedColors, setSearchParams]
  );

  const clearFilters = () => {
    setPriceRange({ min: 0, max: 50000 });
    setInStockOnly(false);
    setOnSaleOnly(false);
    setSortBy("newest");
    const next = new URLSearchParams(searchParams);
    next.delete("color");
    next.delete("size");
    setSearchParams(next, { replace: true });
  };

  const categoryTitle = searchQuery
    ? `Search results for "${searchQuery}"`
    : currentCategory?.name || (slug === "all" ? "All Products" : slug);

  const hasActiveFilters =
    inStockOnly ||
    onSaleOnly ||
    selectedColors.length > 0 ||
    selectedSizes.length > 0 ||
    priceRange.min > 0 ||
    priceRange.max < 50000;

  // Prevent body scroll when filter drawer is open
  useEffect(() => {
    if (showFilters) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showFilters]);

  return (
    <Layout>
      {/* Category header — same gold band as every other archive page. */}
      <PageBand
        title={categoryTitle}
        crumbs={[{ label: searchQuery ? "Search" : categoryTitle }]}
        subtitle={
          isLoading
            ? undefined
            : `${products.length} product${products.length === 1 ? "" : "s"}`
        }
      />

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters - Desktop */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-28 space-y-6">
              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="w-full"
                >
                  <WoodmartIcon name="close" size={14} className="mr-2" />
                  Clear Filters
                </Button>
              )}

              {sizeFacet.length > 0 && (
                <div>
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground mb-3">SIZE</h3>
                  <div className="flex flex-wrap gap-2">
                    {sizeFacet.map((sz) => {
                      const active = selectedSizes.includes(sz.name);
                      return (
                        <button
                          key={sz.name}
                          type="button"
                          onClick={() => toggleSize(sz.name)}
                          aria-pressed={active}
                          title={`${sz.name} (${sz.count})`}
                          className={`min-w-[44px] rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-primary hover:text-brand-ink"
                          }`}
                        >
                          {sz.name}
                          <span className="ml-1 text-[10px] font-normal opacity-60">{sz.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {colorFacet.length > 0 && (
                <div>
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground mb-3">COLOUR</h3>
                  <div className="flex flex-wrap gap-2">
                    {colorFacet.map((c) => {
                      const active = selectedColors.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => toggleColor(c.name)}
                          aria-pressed={active}
                          title={`${c.name} (${c.count})`}
                          className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                            active
                              ? "border-primary bg-brand-tint text-brand-ink font-semibold"
                              : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                          }`}
                        >
                          <span
                            className="h-4 w-4 rounded-full border border-black/10 shrink-0"
                            style={{ backgroundColor: c.hex }}
                          />
                          {c.name}
                          <span className="text-[10px] opacity-60">{c.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground mb-3">AVAILABILITY</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    <Checkbox
                      checked={inStockOnly}
                      onCheckedChange={(checked) => setInStockOnly(checked === true)}
                    />
                    In Stock Only
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    <Checkbox
                      checked={onSaleOnly}
                      onCheckedChange={(checked) => setOnSaleOnly(checked === true)}
                    />
                    On Sale
                  </label>
                </div>
              </div>

              <div>
                <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground mb-3">PRICE</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rs.</span>
                  <input
                    type="number"
                    value={priceRange.min}
                    onChange={(e) => setPriceRange(prev => ({ ...prev, min: +e.target.value }))}
                    className="control w-24"
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <input
                    type="number"
                    value={priceRange.max}
                    onChange={(e) => setPriceRange(prev => ({ ...prev, max: +e.target.value }))}
                    className="control w-24"
                    placeholder="50000"
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* Product Grid */}
          <div className="flex-1">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <WoodmartIcon name="filter" size={16} className="mr-2" />
                  Filter
                </Button>
                <span className="text-sm text-muted-foreground">
                  {products.length} of {rawProducts.length} items{isFetchingNextPage ? " (loading more...)" : ""}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden lg:flex items-center gap-1">
                  <Button
                    variant={gridView === "grid" ? "secondary" : "ghost"}
                    size="iconSm"
                    onClick={() => setGridView("grid")}
                  >
                    <WoodmartIcon name="grid" size={16} />
                  </Button>
                  <Button
                    variant={gridView === "list" ? "secondary" : "ghost"}
                    size="iconSm"
                    onClick={() => setGridView("list")}
                  >
                    <WoodmartIcon name="list" size={16} />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="control cursor-pointer"
                  >
                    <option value="default">Best Selling</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="newest">Newest</option>
                    <option value="name-asc">Name: A to Z</option>
                    <option value="name-desc">Name: Z to A</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Mobile Filter Sidebar Canvas */}
            {showFilters && (
              <div className="lg:hidden fixed inset-0 z-50">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setShowFilters(false)}
                />

                {/* Sidebar */}
                <div className="absolute left-0 top-0 h-full w-80 max-w-[85vw] bg-background shadow-xl animate-slide-in-left overflow-y-auto">
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background z-10">
                    <h2 className="font-heading text-lg font-semibold">Filters</h2>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="p-2 hover:bg-muted hover:text-brand-ink rounded-full transition-colors"
                    >
                      <WoodmartIcon name="close" size={18} />
                    </button>
                  </div>

                  <div className="p-4 space-y-6">
                    {/* Clear Filters */}
                    {hasActiveFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                        className="w-full"
                      >
                        <WoodmartIcon name="close" size={14} className="mr-2" />
                        Clear Filters
                      </Button>
                    )}

                    {/* Size */}
                    {sizeFacet.length > 0 && (
                      <div>
                        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground mb-3">SIZE</h3>
                        <div className="flex flex-wrap gap-2">
                          {sizeFacet.map((sz) => {
                            const active = selectedSizes.includes(sz.name);
                            return (
                              <button
                                key={sz.name}
                                type="button"
                                onClick={() => toggleSize(sz.name)}
                                aria-pressed={active}
                                title={`${sz.name} (${sz.count})`}
                                className={`min-w-[44px] rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                                  active
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border text-muted-foreground hover:border-primary hover:text-brand-ink"
                                }`}
                              >
                                {sz.name}
                                <span className="ml-1 text-[10px] font-normal opacity-60">{sz.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Colour */}
                    {colorFacet.length > 0 && (
                      <div>
                        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground mb-3">COLOUR</h3>
                        <div className="flex flex-wrap gap-2">
                          {colorFacet.map((c) => {
                            const active = selectedColors.includes(c.name);
                            return (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => toggleColor(c.name)}
                                aria-pressed={active}
                                title={`${c.name} (${c.count})`}
                                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                                  active
                                    ? "border-primary bg-brand-tint text-brand-ink font-semibold"
                                    : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                                }`}
                              >
                                <span
                                  className="h-4 w-4 rounded-full border border-black/10 shrink-0"
                                  style={{ backgroundColor: c.hex }}
                                />
                                {c.name}
                                <span className="text-[10px] opacity-60">{c.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Availability */}
                    <div>
                      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground mb-3">AVAILABILITY</h3>
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                          <Checkbox
                            checked={inStockOnly}
                            onCheckedChange={(checked) => setInStockOnly(checked === true)}
                          />
                          In Stock Only
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                          <Checkbox
                            checked={onSaleOnly}
                            onCheckedChange={(checked) => setOnSaleOnly(checked === true)}
                          />
                          On Sale
                        </label>
                      </div>
                    </div>

                    {/* Price */}
                    <div>
                      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground mb-3">PRICE</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Rs.</span>
                        <input
                          type="number"
                          value={priceRange.min}
                          onChange={(e) => setPriceRange(prev => ({ ...prev, min: +e.target.value }))}
                          className="control w-24"
                          placeholder="0"
                        />
                        <span className="text-sm text-muted-foreground">to</span>
                        <input
                          type="number"
                          value={priceRange.max}
                          onChange={(e) => setPriceRange(prev => ({ ...prev, max: +e.target.value }))}
                          className="control w-24"
                          placeholder="50000"
                        />
                      </div>
                    </div>

                    {/* Apply Button */}
                    <Button
                      onClick={() => setShowFilters(false)}
                      className="w-full h-12"
                    >
                      APPLY FILTERS
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Products Grid */}
            {isLoading ? (
              <div className={`grid gap-4 lg:gap-6 ${gridView === "grid"
                ? "grid-cols-2 md:grid-cols-3"
                : "grid-cols-1"
                }`}>
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="space-y-3 animate-pulse">
                    <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <Reveal>
                <div className={`grid gap-4 lg:gap-6 ${gridView === "grid"
                  ? "grid-cols-2 md:grid-cols-3"
                  : "grid-cols-1"
                  }`}>
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </Reveal>
            )}

            {/* Infinite scroll sentinel + loading indicator */}
            {!isLoading && products.length > 0 && (
              <div ref={loadMoreRef} className="flex justify-center py-8">
                {isFetchingNextPage && (
                  <CircleNotch className="h-6 w-6 animate-spin text-muted-foreground" />
                )}
              </div>
            )}

            {!isLoading && products.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No products found in this category.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Collection;
