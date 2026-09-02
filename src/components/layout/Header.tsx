import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useSearch } from "@/contexts/SearchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWooCommerceCategories } from "@/hooks/useWooCommerce";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "@phosphor-icons/react";
import WoodmartIcon from "@/components/ui/WoodmartIcon";

// Header icons — real glyphs from the reference site's icon font (kayalslifestyle.com).
const AdornMenu = () => <WoodmartIcon name="menu" size={26} />;
const AdornClose = () => <WoodmartIcon name="close" size={26} />;
const AdornHeart = () => <WoodmartIcon name="heart" size={26} />;
const AdornCart = () => <WoodmartIcon name="cart" size={26} />;
const AdornUser = () => <WoodmartIcon name="user" size={26} />;
const AdornSearch = () => <WoodmartIcon name="search" size={16} />;

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { totalItems: cartItems, setIsOpen: setCartOpen } = useCart();
  const { totalItems: wishlistItems } = useWishlist();
  const { openSearch } = useSearch();
  const { isAuthenticated, user, logout } = useAuth();
  const { data: categoriesData } = useWooCommerceCategories();
  const categories = categoriesData?.categories || [];

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Shop All", href: "/collections/all" },
    { name: "Contact", href: "/contact" },
  ];

  return (
    <>
      <header className="bg-background z-50">
        <div className="container mx-auto px-4">
          {/* Mobile Header */}
          <div className="flex lg:hidden items-center justify-between h-20">
            {/* Left - Burger & Wishlist */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                className="h-10 w-10 p-0"
                style={{ height: '40px', width: '40px' }}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <AdornClose /> : <AdornMenu />}
              </Button>
              <Link to="/wishlist">
                <Button variant="ghost" className="h-10 w-10 p-0" style={{ height: '40px', width: '40px' }}>
                  <AdornHeart />
                </Button>
              </Link>
            </div>

            {/* Center - Logo */}
            <Link to="/" className="absolute left-1/2 -translate-x-1/2">
              <img
                src="/logo-kayals.jpg"
                alt="Kayals Lifestyle"
                className="h-14 w-auto"
              />
            </Link>

            {/* Right - Cart & Account */}
            {/* Right - Account & Cart */}
            <div className="flex items-center gap-1">
              <Link to="/account">
                <Button variant="ghost" className="h-10 w-10 p-0" style={{ height: '40px', width: '40px' }}>
                  <AdornUser />
                </Button>
              </Link>
              <Button variant="ghost" className="h-10 w-10 relative p-0" style={{ height: '40px', width: '40px' }} onClick={() => setCartOpen(true)}>
                <AdornCart />
                {cartItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#800000] text-white text-[10px] flex items-center justify-center font-bold">
                    {cartItems}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:flex items-center justify-between h-24">
            {/* Logo - Left aligned */}
            <Link to="/" className="flex-shrink-0">
              <img
                src="/logo-kayals.jpg"
                alt="Kayals Lifestyle"
                className="h-10 w-auto"
              />
            </Link>

            {/* Desktop Search - Center */}
            <div className="flex flex-1 max-w-xl mx-8">
              <div className="relative w-full" onClick={openSearch}>
                <Input
                  type="text"
                  placeholder="Search here for all products"
                  className="w-full pl-4 pr-12 py-3 h-12 border-border rounded-full text-base cursor-pointer"
                  readOnly
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10"
                >
                  <AdornSearch />
                </Button>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="flex items-center gap-8 mr-8">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  className="text-sm font-medium uppercase tracking-wider hover:text-primary transition-colors"
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            {/* Right icons */}
            <div className="flex items-center gap-2">
              <Link to="/account">
                <Button variant="ghost" size="icon">
                  <AdornUser />
                </Button>
              </Link>
              <Link to="/wishlist" className="relative">
                <Button variant="ghost" size="icon">
                  <AdornHeart />
                </Button>
                {wishlistItems > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#800000] text-white text-xs flex items-center justify-center font-bold">
                    {wishlistItems}
                  </span>
                )}
              </Link>
              <Button variant="ghost" size="icon" className="relative" onClick={() => setCartOpen(true)}>
                <AdornCart />
                {cartItems > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#800000] text-white text-xs flex items-center justify-center font-bold">
                    {cartItems}
                  </span>
                )}
              </Button>
            </div>
          </div>



          {/* Mobile Sidebar (Menu & Categories) */}
          {isMenuOpen && (
            <div className="fixed inset-0 z-[60] lg:hidden">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setIsMenuOpen(false)}
              />
              {/* Sidebar Content */}
              <div className="absolute top-0 left-0 bottom-0 w-[85%] max-w-sm bg-background animate-slide-in">
                <div className="flex justify-between items-center p-4 border-b border-border">
                  <span className="font-heading font-bold text-lg">Menu</span>
                  <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(false)}>
                    <X className="h-6 w-6" />
                  </Button>
                </div>

                <div className="p-4">
                  <Tabs defaultValue="menu" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6">
                      <TabsTrigger value="menu">Menu</TabsTrigger>
                      <TabsTrigger value="categories">Categories</TabsTrigger>
                    </TabsList>

                    <TabsContent value="menu" className="space-y-4">
                      {/* OTP Login details */}
                      {isAuthenticated && user ? (
                        <div className="mb-4 rounded-xl border border-border bg-muted/40 p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#800000] text-white font-bold uppercase">
                              {(user.name?.trim()?.charAt(0) || "U")}
                            </div>
                            <div className="min-w-0">
                              <p className="font-heading font-semibold text-base truncate">
                                {user.name || "My Account"}
                              </p>
                              <p className="text-sm text-muted-foreground truncate">
                                +91 {user.phoneNumber}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <Link
                              to="/account"
                              className="flex-1 text-center py-2 px-3 text-sm font-medium rounded-lg bg-[#800000] text-white hover:bg-[#600000] transition-colors"
                              onClick={() => setIsMenuOpen(false)}
                            >
                              My Account
                            </Link>
                            <button
                              type="button"
                              className="flex-1 text-center py-2 px-3 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                              onClick={() => {
                                logout();
                                setIsMenuOpen(false);
                              }}
                            >
                              Logout
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Link
                          to="/account"
                          className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4 hover:border-[#800000] transition-colors"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="font-heading font-semibold text-base">Login / Sign Up</p>
                            <p className="text-sm text-muted-foreground">Login with WhatsApp OTP</p>
                          </div>
                        </Link>
                      )}

                      <nav className="flex flex-col space-y-2">
                        {navLinks.map((link) => (
                          <Link
                            key={link.name}
                            to={link.href}
                            className="py-3 px-2 text-base font-medium border-b border-border/50 hover:text-primary transition-colors"
                            onClick={() => setIsMenuOpen(false)}
                          >
                            {link.name}
                          </Link>
                        ))}
                        <Link
                          to="/account"
                          className="py-3 px-2 text-base font-medium border-b border-border/50 hover:text-primary transition-colors"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          My Account
                        </Link>
                        <Link
                          to="/wishlist"
                          className="py-3 px-2 text-base font-medium border-b border-border/50 hover:text-primary transition-colors flex items-center gap-2"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <WoodmartIcon name="heart" size={18} />
                          Wishlist
                        </Link>
                        <Link
                          to="/orders"
                          className="py-3 px-2 text-base font-medium border-b border-border/50 hover:text-primary transition-colors flex items-center gap-2"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <WoodmartIcon name="list" size={18} />
                          My Orders
                        </Link>
                        <Link
                          to="/size-chart"
                          className="py-3 px-2 text-base font-medium border-b border-border/50 hover:text-primary transition-colors flex items-center gap-2"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <WoodmartIcon name="ruler" size={18} />
                          Size Chart
                        </Link>
                      </nav>
                    </TabsContent>

                    <TabsContent value="categories" className="space-y-4">
                      <div className="flex flex-col space-y-2 max-h-[70vh] overflow-y-auto">
                        <Link
                          to="/collections/all"
                          className="py-3 px-2 text-base font-medium border-b border-border/50 hover:text-primary transition-colors"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          All Products
                        </Link>
                        {categories.map((cat) => (
                          <Link
                            key={cat.id}
                            to={`/collections/${cat.slug}`}
                            className="py-3 px-2 text-base font-medium border-b border-border/50 hover:text-primary transition-colors flex items-center justify-between"
                            onClick={() => setIsMenuOpen(false)}
                          >
                            <span>{cat.name}</span>
                            {cat.image && (
                              <img src={cat.image} alt={cat.name} className="w-8 h-8 rounded-full object-cover" />
                            )}
                          </Link>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Search - Full Width below header (Not Sticky) */}
      <div className="container mx-auto px-4 lg:hidden pb-3 pt-4">
        <div className="relative" onClick={openSearch}>
          <Input
            type="text"
            placeholder="Search here for all products"
            className="w-full pl-4 pr-12 py-2 border-2 border-foreground rounded-xl cursor-pointer placeholder:font-medium h-10"
            readOnly
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9"
          >
            <AdornSearch />
          </Button>
        </div>
      </div>
    </>
  );
};

export default Header;
