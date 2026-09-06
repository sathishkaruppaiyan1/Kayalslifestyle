import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { X, CircleNotch } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/contexts/SearchContext";
import { useWooCommerceProducts } from "@/hooks/useWooCommerce";
import { COLOR_FAMILIES } from "@/lib/colorFamilies";

const AdornSearch = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="10" cy="10" r="7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 15L21 21" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchModal = () => {
  const { isOpen, closeSearch, query, setQuery } = useSearch();
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  const { data, isLoading } = useWooCommerceProducts({
    search: debouncedQuery,
    perPage: 8,
  });

  const products = debouncedQuery.length >= 2 ? data?.products || [] : [];

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}`;

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
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                <AdornSearch />
              </div>
              <Input
                type="text"
                placeholder="Search for products..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-14 pl-12 pr-4 text-base border border-border rounded-md focus-visible:ring-0 focus-visible:border-primary"
                autoFocus
              />
            </div>
            <button
              onClick={closeSearch}
              className="p-3 hover:bg-muted rounded-full transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Trending & Related Searches (Only if query is empty or to encourage search) */}
          {query.length === 0 && (
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
            {query.length < 2 ? (
              <p className="text-center text-muted-foreground py-8">
                Type at least 2 characters to search
              </p>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8">
                <CircleNotch className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : products.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No products found for "{query}"
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
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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

          {/* View All Results */}
          {products.length > 0 && (
            <div className="mt-6 text-center border-t border-border pt-4">
              <Link
                to={`/collections/all?search=${encodeURIComponent(query)}`}
                onClick={closeSearch}
                className="text-sm font-semibold underline text-brand-ink hover:text-primary transition-colors"
              >
                View all results for "{query}"
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
