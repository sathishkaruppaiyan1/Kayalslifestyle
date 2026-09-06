import { Link } from "react-router-dom";
import ProductCard from "@/components/product/ProductCard";
import { Product } from "@/types/product";

interface ProductSectionProps {
  title: string;
  products: Product[];
  viewAllLink?: string;
  emoji?: string;
}

const ProductSection = ({ title, products, viewAllLink, emoji }: ProductSectionProps) => {
  return (
    <section className="py-8 lg:py-16 border-b border-border/40 last:border-0">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center mb-6 lg:mb-8 relative">
          {/* Reference sets section titles in plain dark type on white, with a
              gold keyline — no filled slab. */}
          <h2 className="section-title rule-gold flex flex-col items-center gap-2 text-center z-10">
            <span className="flex items-center gap-2">
              {title} {emoji && <span>{emoji}</span>}
            </span>
          </h2>

          {/* Desktop View All Button - Positioned absolutely to the right */}
          {viewAllLink && (
            <Link
              to={viewAllLink}
              className="hidden md:inline-flex items-center justify-center bg-primary text-primary-foreground px-6 py-2 text-[13px] font-semibold uppercase tracking-wide rounded-md hover:bg-brand-ink transition-colors absolute right-0"
            >
              View All
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
          {products.map((product, index) => (
            <ProductCard key={`${product.id}-${index}`} product={product} />
          ))}
        </div>

        {/* Mobile View All Button */}
        {viewAllLink && (
          <div className="md:hidden mt-8 flex justify-center">
            <Link
              to={viewAllLink}
              className="inline-flex items-center justify-center bg-primary text-primary-foreground px-8 py-3 text-[13px] font-semibold uppercase tracking-wide rounded-md hover:bg-brand-ink transition-colors"
            >
              View All
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductSection;
