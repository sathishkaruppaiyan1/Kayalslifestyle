import { Link } from "react-router-dom";
import { Heart, X, ShoppingBag } from "@phosphor-icons/react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCart } from "@/contexts/CartContext";

const Wishlist = () => {
  const { items, removeFromWishlist, clearWishlist } = useWishlist();
  const { addToCart } = useCart();

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}.00`;

  const handleAddToCart = (product: typeof items[0]) => {
    addToCart(product, 1);
    removeFromWishlist(product.id);
  };

  const handleAddAllToCart = () => {
    items.forEach((product) => {
      if (!product.isSoldOut) {
        addToCart(product, 1);
      }
    });
    clearWishlist();
  };

  if (items.length === 0) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto text-center">
            <Heart className="h-24 w-24 mx-auto text-muted-foreground mb-6" />
            <h1 className="text-2xl font-bold mb-4">Your wishlist is empty</h1>
            <p className="text-muted-foreground mb-8">
              Save items you love by clicking the heart icon on products.
            </p>
            <Link to="/collections/all">
              <Button className="bg-foreground text-background hover:bg-foreground/90 rounded-none font-bold px-8 py-6">
                START SHOPPING
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="bg-[#FFF9E5] py-8 text-center">
        <h1 className="font-heading text-3xl lg:text-4xl">My Wishlist</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Home &gt; Wishlist ({items.length} items)
        </p>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Actions */}
        <div className="flex flex-wrap gap-4 mb-8 justify-between items-center">
          <p className="font-bold">{items.length} items in your wishlist</p>
          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={clearWishlist}
              className="rounded-none font-bold"
            >
              Clear Wishlist
            </Button>
            <Button
              onClick={handleAddAllToCart}
              className="bg-foreground text-background hover:bg-foreground/90 rounded-none font-bold"
            >
              <ShoppingBag className="h-4 w-4 mr-2" />
              Add All to Cart
            </Button>
          </div>
        </div>

        {/* Wishlist Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((product) => (
            <div key={product.id} className="group border border-border">
              {/* Image */}
              <div className="relative aspect-[3/4] bg-muted overflow-hidden">
                <Link to={`/product/${product.id}`}>
                  <img
                    src={product.images[0] || "/placeholder.svg"}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </Link>

                {/* Remove Button */}
                <button
                  onClick={() => removeFromWishlist(product.id)}
                  className="absolute top-2 right-2 p-2 bg-background/90 hover:bg-background rounded-full shadow-sm transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  {product.discount && (
                    <span className="badge-sale text-xs px-2 py-1 font-bold">
                      -{product.discount}%
                    </span>
                  )}
                  {product.isSoldOut && (
                    <span className="badge-soldout text-xs px-2 py-1 font-bold">
                      Sold out
                    </span>
                  )}
                </div>
              </div>

              {/* Product Info */}
              <div className="p-4">
                <Link to={`/product/${product.id}`}>
                  <h3 className="font-bold hover:text-primary transition-colors line-clamp-1">
                    {product.name}
                  </h3>
                </Link>

                <div className="flex items-center gap-2 mt-2">
                  {product.originalPrice && product.originalPrice > product.price && (
                    <span className="text-muted-foreground line-through text-sm">
                      {formatPrice(product.originalPrice)}
                    </span>
                  )}
                  <span className="font-bold text-[#800000]">{formatPrice(product.price)}</span>
                </div>

                {/* Add to Cart Button */}
                <Button
                  onClick={() => handleAddToCart(product)}
                  disabled={product.isSoldOut}
                  className="w-full mt-4 bg-foreground text-background hover:bg-foreground/90 rounded-none font-bold"
                >
                  {product.isSoldOut ? "SOLD OUT" : "ADD TO CART"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Continue Shopping */}
        <div className="text-center mt-12">
          <Link to="/collections/all">
            <Button variant="outline" className="rounded-none font-bold px-8">
              Continue Shopping
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default Wishlist;
