import { Link, useLocation } from "react-router-dom";
import { Storefront, SquaresFour, MagnifyingGlass, ShoppingCart, User } from "@phosphor-icons/react";
import { useSearch } from "@/contexts/SearchContext";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Bottom navigation (mobile only).
 *
 * Uses Phosphor rather than the WoodMart icon font here: WoodMart is a glyph
 * font, so its stroke weight is baked into each character. Phosphor draws
 * real strokes, so the weight can be tuned — "regular" here, a touch heavier
 * than the hairline look, so the icons hold up at 20px on phone screens.
 *
 * Icons stay black on every tab; the active tab is marked by the gold rule
 * above it and a darker, heavier label, so colour never carries the state.
 */

const ICON_SIZE = 20;
const ICON_WEIGHT = "regular" as const;

const MobileNav = () => {
  const location = useLocation();
  const { openSearch } = useSearch();
  const { totalItems: cartItems } = useCart();
  const { isAuthenticated, user } = useAuth();

  // Show login state on the account tab: first name when logged in, otherwise "Login"
  const accountLabel = isAuthenticated
    ? user?.name?.trim().split(" ")[0] || "Account"
    : "Login";

  const navItems = [
    // Shop stays lit across every /collections/* route, not just the index.
    { Icon: Storefront, label: "Shop", href: "/collections/all", matchPrefix: "/collections" },
    { Icon: SquaresFour, label: "Categories", href: "/categories" },
    { Icon: MagnifyingGlass, label: "Search", action: openSearch },
    { Icon: ShoppingCart, label: "Cart", href: "/cart", count: cartItems },
    { Icon: User, label: accountLabel, href: "/account" },
  ];

  return (
    <nav data-mobile-nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 shadow-[0_0_10px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-around py-2">
        {navItems.map(({ Icon, label, href, action, count, matchPrefix }) => {
          const isActive = matchPrefix
            ? location.pathname.startsWith(matchPrefix)
            : href
              ? location.pathname === href
              : false;

          const inner = (
            <>
              {/* Gold rule marks the active tab, so the icon can stay black. */}
              <span
                className={`absolute -top-2 h-0.5 w-8 rounded-full transition-colors ${
                  isActive ? "bg-primary" : "bg-transparent"
                }`}
              />
              <span className="relative text-foreground">
                <Icon size={ICON_SIZE} weight={ICON_WEIGHT} />
                {count !== undefined && count > 0 && (
                  <span className="absolute -top-1.5 -right-2 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-semibold">
                    {count}
                  </span>
                )}
              </span>
              <span
                className={`text-[11px] uppercase tracking-wide max-w-[60px] truncate ${
                  isActive ? "text-foreground font-semibold" : "text-muted-foreground font-medium"
                }`}
              >
                {label}
              </span>
            </>
          );

          const classes =
            "relative flex flex-col items-center gap-1 px-2 py-1 transition-colors";

          return action ? (
            <button key={label} onClick={action} className={classes} aria-label={label}>
              {inner}
            </button>
          ) : (
            <Link key={label} to={href!} className={classes} aria-label={label}>
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
