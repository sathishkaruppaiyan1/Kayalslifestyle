import { useState, useMemo, memo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Product } from "@/types/product";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { getProductCardImage, preloadImage } from "@/lib/imageOptimizer";
import WoodmartIcon from "@/components/ui/WoodmartIcon";
import ColorSwatches from "@/components/product/ColorSwatches";

interface ProductCardProps {
  product: Product;
}

const ProductCard = memo(({ product }: ProductCardProps) => {
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const navigate = useNavigate();
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const formatPrice = (price: number) => {
    return `Rs. ${price.toLocaleString("en-IN")}`;
  };

  const inWishlist = isInWishlist(product.id);

  // Memoize current image with optimization
  const currentImage = useMemo(() => {
    let imageUrl: string;
    if (selectedColor && product.variationImages) {
      const variationMatch = product.variationImages.find(
        (v) => v.color.toLowerCase() === selectedColor.toLowerCase()
      );
      if (variationMatch && variationMatch.images.length > 0) {
        imageUrl = variationMatch.images[0];
      } else {
        imageUrl = product.images[0] || "/placeholder.svg";
      }
    } else {
      imageUrl = product.images[0] || "/placeholder.svg";
    }
    // Optimize image URL for faster loading (smaller size, better compression)
    return imageUrl.startsWith("/") || imageUrl.startsWith("data:")
      ? imageUrl
      : getProductCardImage(imageUrl);
  }, [selectedColor, product.variationImages, product.images]);

  // Preload main product image for faster hover/click
  useEffect(() => {
    if (currentImage && !currentImage.startsWith("/placeholder")) {
      preloadImage(currentImage).catch(() => {
        // Silently fail - image will load normally
      });
    }
  }, [currentImage]);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If it's a variable product, we must go to product page to select variations
    if (product.type === "variable") {
      navigate(`/product/${product.id}`);
      return;
    }

    // Default to first size if available, or just add product
    const size = product.sizes && product.sizes.length > 0 ? product.sizes[0] : undefined;
    addToCart(product, 1, size, selectedColor || undefined);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product);
  };

  return (
    <div className="group animate-fade-in">
      <div className="relative overflow-hidden bg-muted aspect-[1/1.5]">
        <Link to={`/product/${product.id}`}>
          <img
            src={currentImage}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 animate-zoom-out"
            onError={(e) => {
              // Fallback to placeholder if image fails to load
              const target = e.target as HTMLImageElement;
              if (target.src !== "/placeholder.svg") {
                target.src = "/placeholder.svg";
              }
            }}
          />
        </Link>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.discount && (
            <span className="badge-sale">
              -{product.discount}%
            </span>
          )}
          {product.isNew && (
            <span className="badge-new">
              New
            </span>
          )}
          {product.isSoldOut && (
            <span className="badge-soldout">
              Sold out
            </span>
          )}
        </div>

        {/* Action buttons - hidden on mobile for Cart, visible on hover desktop */}
        <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <Button
            variant="icon"
            size="iconSm"
            className={`bg-background/90 hover:bg-background shadow-sm ${inWishlist ? "text-brand-ink" : "text-foreground"}`}
            onClick={handleWishlist}
          >
            <WoodmartIcon name="heart" size={18} />
          </Button>
          <Button
            variant="icon"
            size="iconSm"
            className="hidden md:inline-flex bg-background/90 hover:bg-background shadow-sm"
            onClick={handleAddToCart}
            disabled={product.isSoldOut}
          >
            <WoodmartIcon name="cart" size={18} />
          </Button>
        </div>

        {/* Add to Cart on hover - bottom (hidden on mobile, visible on desktop hover) */}
        <div className="hidden md:block absolute bottom-0 left-0 right-0 bg-primary text-primary-foreground py-3 text-center font-semibold text-[13px] tracking-wide opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer uppercase"
          onClick={handleAddToCart}
        >
          {product.isSoldOut ? "SOLD OUT" : "ADD TO CART"}
        </div>
      </div>

      {/* Product info */}
      <div className="mt-3 space-y-2 text-center">
        <Link to={`/product/${product.id}`}>
          <h3 className="font-heading text-sm font-semibold text-foreground hover:text-brand-ink transition-colors line-clamp-1">
            {product.name}
          </h3>
        </Link>

        <div className="flex items-center justify-center flex-wrap gap-2">
          <span className="price text-[15px]">{formatPrice(product.price)}</span>
          {product.originalPrice && product.originalPrice > product.price && (
            <>
              <span className="price-old text-[13px]">
                {formatPrice(product.originalPrice)}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
              </span>
            </>
          )}
        </div>

        {/* Compact colour chips — the card's original swatch design. */}
        <ColorSwatches
          variant="card"
          colors={product.colors}
          variationImages={product.variationImages}
          selected={selectedColor}
          onSelect={setSelectedColor}
          max={4}
        />
      </div>
    </div>
  );
});

ProductCard.displayName = "ProductCard";

export default ProductCard;
