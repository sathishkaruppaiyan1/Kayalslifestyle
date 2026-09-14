import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useWooCommerceCategories } from "@/hooks/useWooCommerce";
import { Skeleton } from "@/components/ui/skeleton";
import type { Category } from "@/types/product";

/**
 * Category cards, one level of the tree at a time.
 *
 * With no `parentId` it shows the top-level categories. A card whose category
 * has sub-categories opens /categories/<slug> (the next level down); a leaf
 * category goes straight to its products at /collections/<slug>.
 */
interface CategoryGridProps {
  /** Show the children of this category; omit for the top level. */
  parentId?: string | null;
  title?: string;
}

const isTopLevel = (c: Category) => c.parentId == null || String(c.parentId) === "0";

export const useCategoryTree = () => {
  const { data, isLoading, error } = useWooCommerceCategories();
  const categories = useMemo(() => data?.categories || [], [data]);

  const childrenOf = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      if (isTopLevel(c)) continue;
      const key = String(c.parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [categories]);

  return { categories, childrenOf, isLoading, error };
};

const CategoryGrid = ({ parentId = null, title = "Shop By Category" }: CategoryGridProps) => {
  const { categories, childrenOf, isLoading, error } = useCategoryTree();

  const displayedCategories = useMemo(() => {
    const level = parentId == null ? categories.filter(isTopLevel) : childrenOf.get(String(parentId)) || [];
    // De-dupe defensively — the API has returned the same term twice before.
    return level.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
  }, [categories, childrenOf, parentId]);

  if (error) {
    console.error("CategoryGrid error:", error);
  }

  if (isLoading) {
    return (
      <section className="pt-4 pb-12 lg:pb-16">
        <div className="container mx-auto px-4">
          <h2 className="section-title rule-gold text-xl font-extrabold text-[#6B1F2A] text-center mb-[10px] md:text-2xl">{title}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[3/4] w-full" />
                <Skeleton className="h-4 w-3/4 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (displayedCategories.length === 0) {
    return null;
  }

  return (
    <section className="pb-12 lg:pb-16 bg-background">
      <div className="container mx-auto px-4">
        <h2 className="section-title rule-gold text-xl font-extrabold text-[#6B1F2A] text-center mb-[10px] md:text-2xl">{title}</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {displayedCategories.map((category, index) => {
            const subCount = childrenOf.get(category.id)?.length ?? 0;
            const href = subCount > 0 ? `/categories/${category.slug}` : `/collections/${category.slug}`;
            return (
              <Link
                key={category.id}
                to={href}
                className="group animate-fade-in block h-full"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 h-full flex flex-col p-3">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg">
                    <img
                      src={category.image}
                      alt={category.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 animate-zoom-out"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== "/placeholder.svg") {
                          target.src = "/placeholder.svg";
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-foreground/10 group-hover:bg-foreground/0 transition-colors" />
                  </div>
                  <div className="pt-3 bg-white">
                    <h3 className="text-center font-bold text-base lg:text-lg group-hover:text-primary transition-colors text-black">
                      {category.name}
                    </h3>
                    {subCount > 0 && (
                      <p className="mt-0.5 text-center text-xs text-muted-foreground">
                        {subCount} {subCount === 1 ? "collection" : "collections"} ›
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CategoryGrid;
