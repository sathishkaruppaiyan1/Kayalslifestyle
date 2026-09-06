import { useState } from "react";
import { Link } from "react-router-dom";
import { X, Minus, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useQuickView } from "@/contexts/QuickViewContext";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";

const AdornHeart = ({ filled }: { filled?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2">
    <path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const QuickViewModal = () => {
  const { product, isOpen, closeQuickView } = useQuickView();
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  if (!isOpen || !product) return null;

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}.00`;
  const inWishlist = isInWishlist(product.id);

  const isColorOutOfStock = (colorName: string): boolean => {
    if (!product || !product.variations || product.variations.length === 0) return false;
    const colorVariations = product.variations.filter(
      (v) => v.color.toLowerCase() === colorName.toLowerCase()
    );
    if (colorVariations.length === 0) return false;
    return colorVariations.every((v) => v.stockStatus === 'outofstock' || (v.manageStock && (v.stockQuantity === 0 || v.stockQuantity === null)));
  };

  const isSizeOutOfStock = (size: string): boolean => {
    if (!product || !product.variations || product.variations.length === 0) return false;

    // QuickViewModal doesn't seem to have selectedColor state, it might only have sizes or uses product.colors[0]
    // Let's assume for now it check across all if no selection
    const sizeVariations = product.variations.filter((v) => v.size === size);
    if (sizeVariations.length === 0) return false;
    return sizeVariations.every((v) => v.stockStatus === 'outofstock' || (v.manageStock && (v.stockQuantity === 0 || v.stockQuantity === null)));
  };

  const handleAddToCart = () => {
    addToCart(product, quantity, selectedSize || undefined);
    closeQuickView();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeQuickView}
      />

      {/* Modal */}
      <div className="relative bg-background w-full max-w-4xl max-h-[90vh] overflow-auto animate-scale-in">
        {/* Close button */}
        <button
          onClick={closeQuickView}
          className="absolute top-4 right-4 z-10 p-2 hover:bg-muted rounded-full transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid md:grid-cols-2 gap-6 p-6">
          {/* Images */}
          <div className="space-y-4">
            <div className="aspect-[3/4] bg-muted overflow-hidden">
              <img
                src={product.images[activeImage] || "/placeholder.svg"}
                alt={product.name}
                className="w-full h-full object-cover animate-zoom-out"
              />
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {product.images.slice(0, 4).map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveImage(index)}
                    className={`flex-shrink-0 w-16 h-20 border-2 overflow-hidden ${activeImage === index ? "border-foreground" : "border-transparent"
                      }`}
                  >
                    <img
                      src={image}
                      alt={`${product.name} ${index + 1}`}
                      className="w-full h-full object-cover animate-zoom-out"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">{product.name}</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xl font-bold">{formatPrice(product.price)}</span>
                {product.originalPrice && product.originalPrice > product.price && (
                  <span className="text-muted-foreground line-through">
                    {formatPrice(product.originalPrice)}
                  </span>
                )}
              </div>
            </div>

            {/* Size Selection */}
            {product.sizes && product.sizes.length > 0 && (
              <div>
                <p className="font-bold mb-2">Size</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => {
                    const outOfStock = isSizeOutOfStock(size);
                    return (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`min-w-[50px] h-10 px-4 rounded-full border font-medium transition-all relative ${selectedSize === size
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:border-foreground"
                          } ${outOfStock ? "opacity-60" : ""}`}
                        title={outOfStock ? "Out of Stock" : ""}
                      >
                        {size}
                        {outOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <X className="h-6 w-6 text-black/40 stroke-[1.2]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <p className="font-bold mb-2">Quantity</p>
              <div className="flex items-center border border-border w-fit">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center font-bold">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleAddToCart}
                variant="addToCart" className="flex-1 h-12"
                disabled={product.isSoldOut}
              >
                {product.isSoldOut ? "SOLD OUT" : "ADD TO CART"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`h-12 w-12 ${inWishlist ? "text-brand-ink border-primary" : ""}`}
                onClick={() => toggleWishlist(product)}
              >
                <AdornHeart filled={inWishlist} />
              </Button>
            </div>

            {/* View Full Details */}
            <Link
              to={`/product/${product.id}`}
              onClick={closeQuickView}
              className="block text-center text-sm underline hover:text-primary transition-colors"
            >
              View Full Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickViewModal;
