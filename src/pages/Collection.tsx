import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { SlidersHorizontal, GridFour, ListBullets, X, CircleNotch } from "@phosphor-icons/react";
import Layout from "@/components/layout/Layout";
import ProductCard from "@/components/product/ProductCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useWooCommerceProductsInfinite, useWooCommerceCategories } from "@/hooks/useWooCommerce";

type SortOption = "default" | "price-low" | "price-high" | "newest" | "name-asc" | "name-desc";

const Collection = () => {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  const [showFilters, setShowFilters] = useState(false);
  const [gridView, setGridView] = useState<"grid" | "list">("grid");
  const [priceRange, setPriceRange] = useState({ min: 0, max: 50000 });
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);

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
  }, [rawProducts, priceRange, sortBy, inStockOnly, onSaleOnly]);

  const clearFilters = () => {
    setPriceRange({ min: 0, max: 50000 });
    setInStockOnly(false);
    setOnSaleOnly(false);
    setSortBy("newest");
  };

  const categoryTitle = searchQuery
    ? `Search results for "${searchQuery}"`
    : currentCategory?.name || (slug === "all" ? "All Products" : slug);

  const hasActiveFilters = inStockOnly || onSaleOnly || priceRange.min > 0 || priceRange.max < 50000;

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
      {/* Category Header */}
      <div className="bg-[#FFF9E5] py-8 text-center">
        <h1 className="font-heading text-3xl lg:text-4xl">
          {categoryTitle}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Home &gt; {searchQuery ? "Search" : categoryTitle}
        </p>
      </div>

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
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}

              <div>
                <h3 className="font-bold mb-3">CATEGORIES</h3>
                {categoriesLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-4 w-24" />
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-2 text-sm">
                    <li>
                      <a
                        href="/collections/all"
                        className={`hover:text-primary transition-colors ${slug === "all" ? "text-primary font-bold" : "font-medium"
                          }`}
                      >
                        All Products
                      </a>
                    </li>
                    {categories.map((cat) => (
                      <li key={cat.id}>
                        <a
                          href={`/collections/${cat.slug}`}
                          className={`hover:text-primary transition-colors ${slug === cat.slug ? "text-primary font-bold" : "font-medium"
                            }`}
                        >
                          {cat.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="font-bold mb-3">AVAILABILITY</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
                    <Checkbox
                      checked={inStockOnly}
                      onCheckedChange={(checked) => setInStockOnly(checked === true)}
                    />
                    In Stock Only
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
                    <Checkbox
                      checked={onSaleOnly}
                      onCheckedChange={(checked) => setOnSaleOnly(checked === true)}
                    />
                    On Sale
                  </label>
                </div>
              </div>

              <div>
                <h3 className="font-bold mb-3">PRICE</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Rs.</span>
                  <input
                    type="number"
                    value={priceRange.min}
                    onChange={(e) => setPriceRange(prev => ({ ...prev, min: +e.target.value }))}
                    className="w-20 px-2 py-1.5 border border-border text-sm font-medium"
                    placeholder="0"
                  />
                  <span className="text-sm font-medium">to</span>
                  <input
                    type="number"
                    value={priceRange.max}
                    onChange={(e) => setPriceRange(prev => ({ ...prev, max: +e.target.value }))}
                    className="w-20 px-2 py-1.5 border border-border text-sm font-medium"
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
                  className="lg:hidden font-bold"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filter
                </Button>
                <span className="text-sm text-muted-foreground font-medium">
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
                    <GridFour className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={gridView === "list" ? "secondary" : "ghost"}
                    size="iconSm"
                    onClick={() => setGridView("list")}
                  >
                    <ListBullets className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="text-sm border border-border px-3 py-1.5 bg-background font-medium"
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
                    <h2 className="text-lg font-bold">Filters</h2>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="p-2 hover:bg-muted rounded-full transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="p-4 space-y-6">
                    {/* Clear Filters */}
                    {hasActiveFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                        className="w-full font-bold"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Filters
                      </Button>
                    )}

                    {/* Categories */}
                    <div>
                      <h3 className="font-bold mb-3">CATEGORIES</h3>
                      <ul className="space-y-2 text-sm">
                        <li>
                          <a
                            href="/collections/all"
                            onClick={() => setShowFilters(false)}
                            className={`block py-1 hover:text-primary transition-colors ${slug === "all" ? "text-primary font-bold" : "font-medium"
                              }`}
                          >
                            All Products
                          </a>
                        </li>
                        {categories.map((cat) => (
                          <li key={cat.id}>
                            <a
                              href={`/collections/${cat.slug}`}
                              onClick={() => setShowFilters(false)}
                              className={`block py-1 hover:text-primary transition-colors ${slug === cat.slug ? "text-primary font-bold" : "font-medium"
                                }`}
                            >
                              {cat.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Availability */}
                    <div>
                      <h3 className="font-bold mb-3">AVAILABILITY</h3>
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
                          <Checkbox
                            checked={inStockOnly}
                            onCheckedChange={(checked) => setInStockOnly(checked === true)}
                          />
                          In Stock Only
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
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
                      <h3 className="font-bold mb-3">PRICE</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Rs.</span>
                        <input
                          type="number"
                          value={priceRange.min}
                          onChange={(e) => setPriceRange(prev => ({ ...prev, min: +e.target.value }))}
                          className="w-20 px-2 py-1.5 border border-border text-sm font-medium"
                          placeholder="0"
                        />
                        <span className="text-sm font-medium">to</span>
                        <input
                          type="number"
                          value={priceRange.max}
                          onChange={(e) => setPriceRange(prev => ({ ...prev, max: +e.target.value }))}
                          className="w-20 px-2 py-1.5 border border-border text-sm font-medium"
                          placeholder="50000"
                        />
                      </div>
                    </div>

                    {/* Apply Button */}
                    <Button
                      onClick={() => setShowFilters(false)}
                      className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 rounded-none font-bold"
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
              <div className={`grid gap-4 lg:gap-6 ${gridView === "grid"
                ? "grid-cols-2 md:grid-cols-3"
                : "grid-cols-1"
                }`}>
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
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
