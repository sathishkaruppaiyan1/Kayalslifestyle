import { Link } from "react-router-dom";
import { useWooCommerceCategories } from "@/hooks/useWooCommerce";
import { Skeleton } from "@/components/ui/skeleton";

const CategoryGrid = () => {
  const { data, isLoading, error } = useWooCommerceCategories();
  const categories = data?.categories || [];

  if (error) {
    console.error("CategoryGrid error:", error);
  }

  if (isLoading) {
    return (
      <section className="pt-4 pb-12 lg:pb-16">
        <div className="container mx-auto px-4">
          <h2 className="section-title text-center mb-8">
            Shop By Category
          </h2>
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

  if (categories.length === 0) {
    return null;
  }

  return (
    <section className="pb-12 lg:pb-16 bg-background">
      <div className="container mx-auto px-4">
        <h2 className="section-title text-center mb-8">
          Shop By Category
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {categories.map((category, index) => (
            <Link
              key={category.id}
              to={`/collections/${category.slug}`}
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
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
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
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryGrid;
