import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

// Scroll to top on route change
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { IconContext } from "@phosphor-icons/react";
import { queryClient } from "./lib/queryClient";
import { CartProvider } from "./contexts/CartContext";
import { WishlistProvider } from "./contexts/WishlistContext";
import { QuickViewProvider } from "./contexts/QuickViewContext";
import { SearchProvider } from "./contexts/SearchContext";
import { AuthProvider } from "./contexts/AuthContext";
import CartDrawer from "./components/cart/CartDrawer";
import QuickViewModal from "./components/product/QuickViewModal";
import SearchModal from "./components/search/SearchModal";
import RouteLoading from "./components/ui/RouteLoading";

// Lazy load pages
const Index = lazy(() => import("./pages/Index"));
const Collection = lazy(() => import("./pages/Collection"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Cart = lazy(() => import("./pages/Cart"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Checkout = lazy(() => import("./pages/Checkout"));
const ThankYou = lazy(() => import("./pages/ThankYou"));
const Account = lazy(() => import("./pages/Account"));
const WordPressPage = lazy(() => import("./pages/WordPressPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TrackOrder = lazy(() => import("./pages/TrackOrder"));
const Orders = lazy(() => import("./pages/Orders"));
const Contact = lazy(() => import("./pages/Contact"));
const SizeChart = lazy(() => import("./pages/SizeChart"));

const WordPressPageKeyed = (props: { routeSlug?: string }) => {
  const { pathname } = useLocation();
  return <WordPressPage key={pathname} {...props} />;
};

const App = () => (
  <IconContext.Provider value={{ weight: "regular", size: 24, mirrored: false }}>
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <QuickViewProvider>
              <SearchProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <ScrollToTop />
                  <Suspense fallback={<RouteLoading />}>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/collections/:slug" element={<Collection />} />
                      <Route path="/product/:id" element={<ProductDetail />} />
                      <Route path="/cart" element={<Cart />} />
                      <Route path="/wishlist" element={<Wishlist />} />
                      <Route path="/checkout" element={<Checkout />} />
                      <Route path="/thank-you" element={<ThankYou />} />
                      <Route path="/account" element={<Account />} />
                      {/* WordPress Pages: key by pathname so each policy loads correct content */}
                      <Route path="/page/:slug" element={<WordPressPageKeyed />} />
                      <Route path="/about" element={<WordPressPageKeyed routeSlug="about" />} />
                      <Route path="/about-us" element={<WordPressPageKeyed routeSlug="about-us" />} />
                      <Route path="/terms" element={<WordPressPageKeyed routeSlug="terms" />} />
                      <Route path="/shipping" element={<WordPressPageKeyed routeSlug="shipping" />} />
                      <Route path="/privacy" element={<WordPressPageKeyed routeSlug="privacy" />} />
                      <Route path="/refund" element={<WordPressPageKeyed routeSlug="refund" />} />
                      <Route path="/track" element={<TrackOrder />} />
                      <Route path="/track-order" element={<TrackOrder />} />
                      <Route path="/orders" element={<Orders />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/size-chart" element={<SizeChart />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                  <CartDrawer />
                  <QuickViewModal />
                  <SearchModal />
                </BrowserRouter>
              </SearchProvider>
            </QuickViewProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </IconContext.Provider>
);

export default App;
