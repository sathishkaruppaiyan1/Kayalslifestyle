import { Link } from "react-router-dom";
import { X, Minus, Plus, ShoppingBag, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";

const CartDrawer = () => {
  const { items, isOpen, setIsOpen, removeFromCart, updateQuantity, totalPrice, totalItems } = useCart();

  if (!isOpen) return null;

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}.00`;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-background shadow-xl animate-slide-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">Shopping Cart ({totalItems})</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground font-medium">Your cart is empty</p>
              <Button
                onClick={() => setIsOpen(false)}
                className="mt-4"
                variant="outline"
              >
                Continue Shopping
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={`${item.product.id}-${item.size}`} className="flex gap-4 pb-4 border-b border-border">
                  <div className="w-20 h-24 bg-muted flex-shrink-0 overflow-hidden">
                    <img
                      src={item.image || item.product.images[0] || "/placeholder.svg"}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{item.product.name}</h3>
                    {/* Variations - Single line "S, BLUE" */}
                    {(item.size || item.color) && (
                      <p className="text-xs text-muted-foreground mt-1 uppercase">
                        {[item.size, item.color].filter(Boolean).join(", ")}
                      </p>
                    )}
                    <p className="font-bold text-sm mt-1">{formatPrice(item.product.price)}</p>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-border">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.size, item.color)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.size, item.color)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.product.id, item.size, item.color)}
                        className="text-xs font-medium border border-border px-2 py-1 hover:bg-muted hover:text-destructive transition-colors flex items-center gap-1"
                      >
                        <Trash className="h-3 w-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-border space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold">Subtotal</span>
              <span className="font-bold text-lg">{formatPrice(totalPrice)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Shipping and taxes calculated at checkout
            </p>
            <div className="grid gap-2">
              <Link to="/cart" onClick={() => setIsOpen(false)}>
                <Button variant="outline" className="w-full h-12">
                  VIEW CART
                </Button>
              </Link>
              <Link to="/checkout" onClick={() => setIsOpen(false)}>
                <Button variant="addToCart" className="w-full h-12">
                  CHECKOUT
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartDrawer;
