import { Link, useLocation } from "react-router-dom";
import { useSearch } from "@/contexts/SearchContext";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";
import WoodmartIcon from "@/components/ui/WoodmartIcon";

// Bottom-nav icons — real glyphs from the reference site's icon font.
// These use currentColor, so the active/inactive tab colour now applies
// (the previous inline SVGs hard-coded stroke="black" and ignored it).
const AdornHome = () => <WoodmartIcon name="home" size={24} />;
const AdornUser = () => <WoodmartIcon name="user" size={24} />;
const AdornSearch = () => <WoodmartIcon name="search" size={24} />;
const AdornHeart = () => <WoodmartIcon name="heart" size={24} />;
const AdornCart = () => <WoodmartIcon name="cart" size={24} />;
const AdornOrders = () => <WoodmartIcon name="list" size={24} />;

const MobileNav = () => {
  const location = useLocation();
  const { openSearch } = useSearch();
  const { totalItems: cartItems } = useCart();
  const { totalItems: wishlistItems } = useWishlist();
  const { isAuthenticated, user } = useAuth();

  // Show login state on the account tab: first name when logged in, otherwise "Login"
  const accountLabel = isAuthenticated
    ? (user?.name?.trim().split(" ")[0] || "Account")
    : "Login";

  const navItems = [
    { icon: AdornHome, label: "Home", href: "/" },
    { icon: AdornOrders, label: "Orders", href: "/orders" },
    { icon: AdornSearch, label: "Search", action: openSearch },
    { icon: AdornHeart, label: "Wishlist", href: "/wishlist", count: wishlistItems },
    { icon: AdornCart, label: "Cart", href: "/cart", count: cartItems },
    { icon: AdornUser, label: accountLabel, href: "/account" },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 shadow-[0_0_10px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-around py-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href ? location.pathname === item.href : false;

          if (item.action) {
            return (
              <button
                key={item.label}
                onClick={item.action}
                className="flex flex-col items-center gap-1 px-2 py-1 transition-colors text-muted-foreground hover:text-foreground"
              >
                <div className="relative -mt-0.5">
                  <Icon />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wide">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.href!}
              className={`flex flex-col items-center gap-1 px-2 py-1 transition-colors relative ${isActive ? "text-[#800000]" : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <div className="relative -mt-0.5">
                <Icon />
                {item.count !== undefined && item.count > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#800000] text-white text-[10px] flex items-center justify-center font-bold">
                    {item.count}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wide max-w-[56px] truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
