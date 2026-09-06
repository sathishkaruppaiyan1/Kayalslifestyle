import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus, ShoppingBag, ArrowLeft, Trash, CircleNotch, Warning } from "@phosphor-icons/react";
import Layout from "@/components/layout/Layout";
import PageBand from "@/components/layout/PageBand";
import { Button } from "@/components/ui/button";
import { useCart, type StockIssue } from "@/contexts/CartContext";
import { toast } from "sonner";

const Cart = () => {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart, validateCartStock } = useCart();
  const [isValidating, setIsValidating] = useState(false);
  const [stockIssues, setStockIssues] = useState<StockIssue[]>([]);

  // Validate cart stock on page load
  useEffect(() => {
    if (items.length === 0) return;

    let cancelled = false;
    setIsValidating(true);

    validateCartStock().then((issues) => {
      if (cancelled) return;
      setStockIssues(issues);
      if (issues.length > 0) {
        const removed = issues.filter(i => i.issue === 'out_of_stock' || i.issue === 'product_removed');
        const adjusted = issues.filter(i => i.issue === 'quantity_exceeded');

        if (removed.length > 0) {
          toast.error(`${removed.length} item(s) removed - no longer available`);
        }
        if (adjusted.length > 0) {
          toast.warning(`${adjusted.length} item(s) adjusted - stock reduced`);
        }
      }
    }).catch((err) => {
      console.error("Stock validation failed:", err);
    }).finally(() => {
      if (!cancelled) setIsValidating(false);
    });

    return () => { cancelled = true; };
  }, []); // Only on mount

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}.00`;

  if (items.length === 0) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto text-center">
            <ShoppingBag className="h-24 w-24 mx-auto text-muted-foreground mb-6" />
            <h1 className="text-2xl font-bold mb-4">Your cart is empty</h1>
            <p className="text-muted-foreground mb-8">
              Looks like you haven't added anything to your cart yet.
            </p>
            {stockIssues.length > 0 && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
                <div className="flex items-center gap-2 text-red-700 font-bold mb-2">
                  <Warning className="h-4 w-4" />
                  Items were removed from your cart
                </div>
                {stockIssues.map((issue, idx) => (
                  <p key={idx} className="text-sm text-red-600">
                    {issue.productName}{issue.size ? ` (${issue.size})` : ""} — {issue.issue === 'out_of_stock' ? 'Out of stock' : 'No longer available'}
                  </p>
                ))}
              </div>
            )}
            <Link to="/collections/all">
              <Button variant="addToCart" className="px-8 py-6">
                CONTINUE SHOPPING
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
      <PageBand title="Shopping Cart" crumbs={[{ label: "Cart" }]} />

      <div className="container mx-auto px-4 py-8">
        {/* Stock validation banner */}
        {isValidating && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            <CircleNotch className="h-4 w-4 animate-spin" />
            Checking stock availability...
          </div>
        )}

        {stockIssues.length > 0 && !isValidating && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-amber-700 font-bold mb-2">
              <Warning className="h-4 w-4" />
              Cart updated due to stock changes
            </div>
            {stockIssues.map((issue, idx) => (
              <p key={idx} className="text-sm text-amber-600">
                {issue.productName}{issue.size ? ` (${issue.size})` : ""} —{" "}
                {issue.issue === 'out_of_stock' || issue.issue === 'product_removed'
                  ? 'Removed (out of stock)'
                  : `Quantity adjusted to ${issue.availableStock} (was ${issue.requestedQuantity})`}
              </p>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 pb-4 border-b border-border font-bold text-sm">
              <div className="col-span-6">Product</div>
              <div className="col-span-2 text-center">Price</div>
              <div className="col-span-2 text-center">Quantity</div>
              <div className="col-span-2 text-right">Total</div>
            </div>

            {/* Items */}
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={`${item.product.id}-${item.size}`} className="py-6">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Product */}
                    <div className="col-span-12 md:col-span-6">
                      <div className="flex gap-4">
                        <div className="w-24 h-32 bg-muted flex-shrink-0 overflow-hidden">
                          <img
                            src={item.image || item.product.images[0] || "/placeholder.svg"}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col items-start text-left">
                          <Link
                            to={`/product/${item.product.id}`}
                            className="font-bold hover:text-primary transition-colors line-clamp-2 text-left"
                          >
                            {item.product.name}
                          </Link>
                          {(item.size || item.color) && (
                            <p className="text-sm text-muted-foreground mt-1 uppercase text-left">
                              {[item.size, item.color].filter(Boolean).join(", ")}
                            </p>
                          )}
                          <button
                            onClick={() => removeFromCart(item.product.id, item.size, item.color)}
                            className="text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors mt-3 flex items-center gap-2 group border border-border rounded-md px-2 py-1"
                          >
                            <Trash className="h-4 w-4 group-hover:text-destructive transition-colors" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="col-span-4 md:col-span-2 text-center">
                      <span className="md:hidden text-sm text-muted-foreground">Price: </span>
                      <span className="font-bold">{formatPrice(item.product.price)}</span>
                    </div>

                    {/* Quantity */}
                    <div className="col-span-4 md:col-span-2 flex justify-center">
                      <div className="flex items-center border border-border">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.size, item.color)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-10 text-center font-bold text-sm">{item.quantity}</span>
                        <button
                          onClick={() => {
                            const getAvailableStock = (): number | null => {
                              const product = item.product;
                              if (product.type === 'simple' || !product.type || product.type === 'external') {
                                return product.stockQuantity ?? null;
                              }
                              if (product.type === 'variable' && product.variationImages && item.color) {
                                const variation = product.variationImages.find(v => v.color === item.color);
                                if (variation?.stockQuantity !== null && variation?.stockQuantity !== undefined) {
                                  return variation.stockQuantity;
                                }
                              }
                              return product.stockQuantity ?? null;
                            };

                            const availableStock = getAvailableStock();
                            if (availableStock !== null && item.quantity >= availableStock) {
                              toast.error(`Only ${availableStock} items available in stock`);
                              return;
                            }
                            updateQuantity(item.product.id, item.quantity + 1, item.size, item.color);
                          }}
                          className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors"
                          disabled={(() => {
                            const getAvailableStock = (): number | null => {
                              const product = item.product;
                              if (product.type === 'simple' || !product.type || product.type === 'external') {
                                return product.stockQuantity ?? null;
                              }
                              if (product.type === 'variable' && product.variationImages && item.color) {
                                const variation = product.variationImages.find(v => v.color === item.color);
                                if (variation?.stockQuantity !== null && variation?.stockQuantity !== undefined) {
                                  return variation.stockQuantity;
                                }
                              }
                              return product.stockQuantity ?? null;
                            };
                            const stock = getAvailableStock();
                            return stock !== null && item.quantity >= stock;
                          })()}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="col-span-4 md:col-span-2 text-right">
                      <span className="md:hidden text-sm text-muted-foreground">Total: </span>
                      <span className="font-bold">{formatPrice(item.product.price * item.quantity)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-4 pt-6 border-t border-border">
              <Link to="/collections/all">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Continue Shopping
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={clearCart}
                className="text-destructive hover:text-destructive"
              >
                Clear Cart
              </Button>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-muted p-6 sticky top-28">
              <h2 className="text-xl font-bold mb-6">Order Summary</h2>

              <div className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal ({items.length} items)</span>
                  <span className="font-bold">{formatPrice(totalPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="font-bold text-green-600">FREE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-bold">Calculated at checkout</span>
                </div>
              </div>

              <div className="border-t border-border mt-6 pt-6">
                <div className="flex justify-between text-lg">
                  <span className="font-bold">Total</span>
                  <span className="font-bold">{formatPrice(totalPrice)}</span>
                </div>
              </div>

              <Link to="/checkout" className="block mt-6">
                <Button
                  variant="addToCart" className="w-full h-12"
                  disabled={isValidating}
                >
                  {isValidating ? (
                    <span className="flex items-center gap-2">
                      <CircleNotch className="h-4 w-4 animate-spin" />
                      Checking stock...
                    </span>
                  ) : (
                    "PROCEED TO CHECKOUT"
                  )}
                </Button>
              </Link>

              <p className="text-xs text-muted-foreground text-center mt-4">
                Shipping & taxes calculated at checkout
              </p>

              {/* Trust Badges */}
              <div className="mt-6 pt-6 border-t border-border space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Secure Checkout</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M6 6H21L19 16H8L6 6Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6 6L5 3H2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="10" cy="20" r="1.5" />
                    <circle cx="17" cy="20" r="1.5" />
                  </svg>
                  <span>Free Shipping All Over India</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Premium Quality</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Cart;
