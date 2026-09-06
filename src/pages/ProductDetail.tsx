import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CaretRight, CaretLeft, Truck, Package, ShieldCheck, CaretDown, CaretUp, CircleNotch, Heart, Ruler, UploadSimple, Star, X } from "@phosphor-icons/react";
import Layout from "@/components/layout/Layout";
import ProductCard from "@/components/product/ProductCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWooCommerceProductById, useWooCommerceProductGallery, useWooCommerceProducts, useWooCommerceReviews, useSubmitWooCommerceReview, type CreateReviewData } from "@/hooks/useWooCommerce";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { toast } from "sonner";
import type { Product } from "@/types/product";
import { getProductDetailImage, getGalleryThumbnail } from "@/lib/imageOptimizer";
import ColorSwatches, { isColorOutOfStock as colorOutOfStock } from "@/components/product/ColorSwatches";
import { sortSizes } from "@/lib/sizes";
import WoodmartIcon from "@/components/ui/WoodmartIcon";

interface VariationImage {
  color: string;
  images: string[];
  attributes?: { name: string; option: string }[];
}

const ProductDetail = () => {
  const { id } = useParams();
  // Progressive loading: Fast initial load with basic variation images
  const { data: product, isLoading, error } = useWooCommerceProductById(id || "");
  // Background load: Full gallery images (only for variable products)
  const { data: productWithGallery } = useWooCommerceProductGallery(id || "", product?.type);

  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const navigate = useNavigate();

  // All state declarations at the top
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Reset quantity when stock changes or selection changes
  useEffect(() => {
    if (!product) return;
    const stock = getAvailableStock();
    if (stock !== null && quantity > stock) {
      setQuantity(Math.max(1, stock));
    } else if (stock === null || stock === 0) {
      // If out of stock, set quantity to 0 or keep at 1 if stock is null (unlimited)
      if (stock === 0) {
        setQuantity(0);
      }
    }
  }, [selectedSize, selectedColor, product?.id, product?.stockQuantity, product?.variationImages]);
  const [activeImage, setActiveImage] = useState(0);
  const [imageKey, setImageKey] = useState(0); // Key to force re-render for smooth transition
  const [expandedSection, setExpandedSection] = useState<string | null>("description");
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const [enhancedVariationImages, setEnhancedVariationImages] = useState<VariationImage[] | null>(null);

  // Review State
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewForm, setReviewForm] = useState({
    name: "",
    email: "",
    title: "",
    review: ""
  });
  const [reviewFiles, setReviewFiles] = useState<string[]>([]); // Base64 strings
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const { data: reviews, isLoading: isLoadingReviews, refetch: refetchReviews } = useWooCommerceReviews(product?.id || "");
  const submitReview = useSubmitWooCommerceReview();

  // Helper function to get available stock for current selection
  const getAvailableStock = (): number | null => {
    if (!product) return null;

    // For simple products, use product stock
    if (product.type === 'simple' || !product.type || product.type === 'external') {
      return product.stockQuantity ?? null;
    }

    // For variable products, find matching variation
    if (product.type === 'variable' && product.variationImages) {
      // Find variation by color (and ideally size, but we need full variation data for that)
      const matchingVariation = product.variationImages.find(
        (v) => v.color === selectedColor
      );

      if (matchingVariation && matchingVariation.stockQuantity !== null && matchingVariation.stockQuantity !== undefined) {
        return matchingVariation.stockQuantity;
      }

      // Fallback: if no stock data in variation, check if product has stock
      return product.stockQuantity ?? null;
    }

    return product.stockQuantity ?? null;
  };

  const isColorOutOfStock = (colorName: string): boolean => colorOutOfStock(product, colorName);

  const isSizeOutOfStock = (size: string): boolean => {
    if (!product || !product.variations || product.variations.length === 0) return false;

    if (selectedColor) {
      const variation = product.variations.find(
        (v) => v.color.toLowerCase() === selectedColor.toLowerCase() && v.size === size
      );
      if (!variation) return false;
      return variation.stockStatus === 'outofstock' || (variation.manageStock && (variation.stockQuantity === 0 || variation.stockQuantity === null));
    }

    const sizeVariations = product.variations.filter((v) => v.size === size);
    if (sizeVariations.length === 0) return false;
    return sizeVariations.every((v) => v.stockStatus === 'outofstock' || (v.manageStock && (v.stockQuantity === 0 || v.stockQuantity === null)));
  };

  const availableStock = getAvailableStock();
  const maxQuantity = availableStock !== null ? availableStock : Infinity;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const base64Promises = filesArray.map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      try {
        const base64Files = await Promise.all(base64Promises);
        setReviewFiles(prev => [...prev, ...base64Files].slice(0, 5)); // Limit to 5
      } catch (error) {
        console.error("Error converting files:", error);
        toast.error("Error uploading images");
      }
    }
  };

  const handleReviewSubmit = async () => {
    if (!rating) {
      toast.error("Please select a rating");
      return;
    }
    if (!reviewForm.name || !reviewForm.email || !reviewForm.review) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmittingReview(true);
    try {
      const reviewData: CreateReviewData = {
        product_id: typeof product?.id === 'string' ? parseInt(product.id) : product?.id || 0,
        review: `<p>${reviewForm.review}</p>`, // WooCommerce expects HTML usually, or plain text
        reviewer: reviewForm.name,
        reviewer_email: reviewForm.email,
        rating: rating,
        images: reviewFiles
      };

      await submitReview(reviewData);
      toast.success("Review submitted successfully!");
      setReviewForm({ name: "", email: "", title: "", review: "" });
      setRating(0);
      setReviewFiles([]);
      refetchReviews();
    } catch (error) {
      console.error("Review submission failed:", error);
      toast.error("Failed to submit review. Please try again.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Touch swipe state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  // Fetch recommended products from same category - skip variations for faster loading
  const { data: recommendedData } = useWooCommerceProducts({
    category: product?.categoryId,
    perPage: 5, // Fetch 5 to have enough after filtering out current product
    skipVariations: true,
    enabled: !!product?.categoryId, // Only fetch when we have the category
  });

  const recommendedProducts = recommendedData?.products?.filter(
    (p) => p.id !== product?.id
  ).slice(0, 4) || [];

  // Handle recently viewed products
  useEffect(() => {
    if (product) {
      const stored = localStorage.getItem("recentlyViewed");
      let viewed: Product[] = stored ? JSON.parse(stored) : [];

      // Remove current product if exists
      viewed = viewed.filter((p) => p.id !== product.id);

      // Add current product to beginning
      viewed.unshift(product);

      // Keep only last 8 products
      viewed = viewed.slice(0, 8);

      localStorage.setItem("recentlyViewed", JSON.stringify(viewed));

      // Set recently viewed excluding current product
      setRecentlyViewed(viewed.filter((p) => p.id !== product.id).slice(0, 4));
    }
  }, [product]);

  // Reset active image when color changes
  useEffect(() => {
    setActiveImage(0);
  }, [selectedColor]);

  // Progressive loading for variation images:
  // 1. First: Use basic variation images from fast load (1 image per color)
  // 2. Then: Upgrade to full gallery images when background load completes
  useEffect(() => {
    // If we have full gallery data, use that (has multiple images per color)
    if (productWithGallery?.variationImages && productWithGallery.variationImages.length > 0) {
      setEnhancedVariationImages(productWithGallery.variationImages);
    }
    // Otherwise use basic variation images from fast load
    else if (product?.variationImages && product.variationImages.length > 0) {
      setEnhancedVariationImages(product.variationImages);
    } else {
      setEnhancedVariationImages(null);
    }
  }, [product?.variationImages, productWithGallery?.variationImages]);

  // Touch swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleSwipe = (imagesLength: number) => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      // Swipe left - go to next image
      const newIndex = (activeImage + 1) % imagesLength;
      setImageKey(prev => prev + 1);
      setActiveImage(newIndex);
    } else if (isRightSwipe) {
      // Swipe right - go to previous image
      const newIndex = (activeImage - 1 + imagesLength) % imagesLength;
      setImageKey(prev => prev + 1);
      setActiveImage(newIndex);
    }
  };

  const changeImage = (newIndex: number, imagesLength: number) => {
    setImageKey(prev => prev + 1);
    setActiveImage(newIndex);
  };

  // Get display images based on selected color
  const getDisplayImages = (): string[] => {
    if (!product) return ["/placeholder.svg"];

    // Use enhanced variation images if available and not empty, otherwise fallback to product variation images
    const sourceImages = (enhancedVariationImages && enhancedVariationImages.length > 0)
      ? enhancedVariationImages
      : (product.variationImages && product.variationImages.length > 0 ? product.variationImages : null);

    if (selectedColor && sourceImages && sourceImages.length > 0) {
      // Normalize color name for matching (trim and lowercase)
      const normalizedSelectedColor = selectedColor.trim().toLowerCase();

      // Try to find exact match with color AND size
      if (selectedSize) {
        const normalizedSelectedSize = selectedSize.trim().toLowerCase();
        const exactMatch = sourceImages.find((v: VariationImage) => {
          const normalizedColor = (v.color || '').trim().toLowerCase();
          const colorMatch = normalizedColor === normalizedSelectedColor;
          const sizeAttr = v.attributes?.find((a) => a.name?.toLowerCase() === "size");
          const sizeMatch = sizeAttr?.option?.trim().toLowerCase() === normalizedSelectedSize;
          return colorMatch && sizeMatch;
        });

        if (exactMatch && exactMatch.images && Array.isArray(exactMatch.images) && exactMatch.images.length > 0) {
          const filtered = exactMatch.images.filter((url: any) => url && typeof url === 'string' && url.trim());
          if (filtered.length > 0) {
            return filtered;
          }
        }
      }

      // Fallback to just color match (case-insensitive, trimmed)
      const variationMatch = sourceImages.find((v: VariationImage) => {
        const normalizedColor = (v.color || '').trim().toLowerCase();
        return normalizedColor === normalizedSelectedColor;
      });

      if (variationMatch && variationMatch.images && Array.isArray(variationMatch.images) && variationMatch.images.length > 0) {
        const filtered = variationMatch.images.filter((url: any) => url && typeof url === 'string' && url.trim());
        if (filtered.length > 0) {
          return filtered;
        }
      }
    }

    // Final fallback to product images
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const filtered = product.images.filter((url: any) => url && typeof url === 'string' && url.trim());
      if (filtered.length > 0) {
        return filtered;
      }
    }

    return ["/placeholder.svg"];
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="aspect-[3/4] bg-muted animate-pulse rounded-lg" />
              <div className="flex gap-2 justify-center">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-2 h-2 bg-muted rounded-full animate-pulse" />
                ))}
              </div>
            </div>
            <div className="space-y-6">
              <div className="h-8 w-3/4 bg-muted animate-pulse rounded" />
              <div className="h-6 w-1/4 bg-muted animate-pulse rounded" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="h-12 bg-muted animate-pulse rounded" />
                <div className="h-12 bg-muted animate-pulse rounded" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !product) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-heading">Product not found</h1>
          <Link to="/" className="text-primary hover:underline mt-4 inline-block">
            Return to home
          </Link>
        </div>
      </Layout>
    );
  }

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}.00`;
  const inWishlist = isInWishlist(product.id);

  const displayImages = getDisplayImages();

  // Optimize images for display (main image larger, thumbnails smaller)
  const optimizedDisplayImages = displayImages.map(img =>
    img.startsWith("/") || img.startsWith("data:")
      ? img
      : getProductDetailImage(img)
  );

  const optimizedThumbnails = displayImages.map(img =>
    img.startsWith("/") || img.startsWith("data:")
      ? img
      : getGalleryThumbnail(img)
  );


  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Parse HTML description to text
  const stripHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  };

  const handleAddToCart = (buyNow = false) => {
    // Validation: Check if variation is selected if variations exist
    if (product.colors && product.colors.length > 0 && !selectedColor) {
      setShowValidation(true);
      toast.error("Please select a color");
      return;
    }
    if (product.sizes && product.sizes.length > 0 && !selectedSize) {
      setShowValidation(true);
      toast.error("Please select a size");
      return;
    }

    // Check if selected size/color combination is out of stock
    if (selectedSize && isSizeOutOfStock(selectedSize)) {
      toast.error(`Size ${selectedSize} is out of stock`);
      setSelectedSize(null);
      return;
    }
    if (selectedColor && isColorOutOfStock(selectedColor)) {
      toast.error(`Color ${selectedColor} is out of stock`);
      setSelectedColor(null);
      return;
    }

    // Check stock availability
    if (availableStock !== null && quantity > availableStock) {
      toast.error(`Only ${availableStock} items available in stock`);
      setQuantity(availableStock);
      return;
    }

    addToCart(product, quantity, selectedSize || undefined, selectedColor || undefined);

    if (buyNow) {
      navigate("/cart");
    } else {
      setShowValidation(false);
    }
  };

  const currentActiveImage = optimizedDisplayImages[activeImage] || "/placeholder.svg";

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="container mx-auto px-4 py-3 border-b border-border">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <CaretRight className="h-4 w-4" />
          <Link
            to={`/collections/${product.categorySlug}`}
            className="hover:text-foreground transition-colors capitalize"
          >
            {product.category}
          </Link>
          <CaretRight className="h-4 w-4" />
          <span className="text-foreground truncate max-w-[200px]">{product.name}</span>
        </nav>
      </div>

      <div className="container mx-auto px-4 py-2">
        <div className="grid lg:grid-cols-2 gap-4 lg:gap-8">
          {/* Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <div
              className="aspect-[3/4] overflow-hidden bg-muted relative group touch-pan-y"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={() => handleSwipe(optimizedDisplayImages.length)}
            >
              <div className="relative w-full h-full overflow-hidden">
                <img
                  key={`img-${activeImage}-${imageKey}`}
                  src={currentActiveImage}
                  alt={product.name}
                  loading="eager"
                  decoding="async"
                  className="w-full h-full object-cover pointer-events-none select-none animate-fade-in"
                  draggable={false}
                  onError={(e) => {
                    // Fallback to placeholder if image fails to load
                    const target = e.target as HTMLImageElement;
                    if (target.src !== "/placeholder.svg") {
                      target.src = "/placeholder.svg";
                    }
                  }}
                />
              </div>

              {/* Wishlist Icon - Top Right */}
              <button
                onClick={() => toggleWishlist(product)}
                className="absolute top-4 right-4 z-10 p-2 bg-white/80 rounded-full hover:bg-white transition-colors shadow-sm"
              >
                <Heart className={`h-6 w-6 ${inWishlist ? "fill-brand-ink text-brand-ink" : "text-gray-600"}`}  weight="fill" />
              </button>

              {selectedColor && (
                <span className="absolute top-4 left-4 bg-primary text-primary-foreground text-[11px] font-semibold rounded-full px-2 py-0.5 capitalize">
                  {selectedColor} Color
                </span>
              )}
              {!selectedColor && product.discount && (
                <span className="absolute top-4 left-4 bg-primary text-primary-foreground text-sm px-4 py-2 font-medium">
                  -{product.discount}%
                </span>
              )}

              {/* Navigation Arrows - Desktop */}
              {optimizedDisplayImages.length > 1 && (
                <>
                  <button
                    onClick={() => changeImage((activeImage - 1 + optimizedDisplayImages.length) % optimizedDisplayImages.length, optimizedDisplayImages.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                    aria-label="Previous image"
                  >
                    <CaretLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => changeImage((activeImage + 1) % optimizedDisplayImages.length, optimizedDisplayImages.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                    aria-label="Next image"
                  >
                    <CaretRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {/* Navigation Dots */}
            {optimizedDisplayImages.length > 1 && (
              <div className="flex gap-2 justify-center mt-4">
                {optimizedThumbnails.map((thumb, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      changeImage(index, optimizedDisplayImages.length);
                      setTouchStart(null); // Reset touch state on click
                    }}
                    className={`rounded-full transition-all duration-300 ${activeImage === index
                      ? "w-2.5 h-2.5 bg-black ring-1 ring-offset-2 ring-black scale-110"
                      : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
                      }`}
                    aria-label={`Go to image ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-2">
            {/* Title & Price */}
            <div>
              <h1 className="font-heading text-xl lg:text-2xl font-semibold text-foreground">
                {product.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xl font-bold text-brand-ink">{formatPrice(product.price)}</span>
                {product.originalPrice && product.originalPrice > product.price && (
                  <>
                    <span className="text-muted-foreground/60 line-through text-lg">
                      {formatPrice(product.originalPrice)}
                    </span>
                    <span className="text-sm font-bold text-destructive border border-destructive px-2 py-0.5 rounded-sm">
                      {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                    </span>
                  </>
                )}
              </div>

            </div>

            {/* Colour Selection — large image tiles, this page's own design. */}
            <ColorSwatches
              variant="detail"
              colors={product.colors || []}
              variationImages={
                (enhancedVariationImages && enhancedVariationImages.length > 0
                  ? enhancedVariationImages
                  : product.variationImages) as never
              }
              product={product}
              selected={selectedColor}
              invalid={showValidation && !selectedColor}
              onSelect={(newColor) => {
                setSelectedColor(newColor);
                // Drop the chosen size if it is not stocked in the new colour.
                if (newColor && selectedSize && product.variations) {
                  const variation = product.variations.find(
                    (v) =>
                      v.color.toLowerCase() === newColor.toLowerCase() && v.size === selectedSize,
                  );
                  if (
                    variation &&
                    (variation.stockStatus === "outofstock" ||
                      (variation.manageStock &&
                        (variation.stockQuantity === 0 || variation.stockQuantity === null)))
                  ) {
                    setSelectedSize(null);
                  }
                }
                setActiveImage(0);
                if (showValidation) setShowValidation(false);
              }}
            />

            {/* Size Selection */}
            {product.sizes.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className={`text-sm font-medium ${showValidation && !selectedSize ? "text-red-600" : ""}`}>
                    Size
                    {showValidation && !selectedSize && <span className="ml-2 text-red-600 animate-pulse">(Required)</span>}
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="text-xs font-medium flex items-center gap-1 hover:text-primary border border-foreground px-2 py-1 rounded">
                        <Ruler className="w-3 h-3" /> Size Chart
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-4">
                      <DialogHeader>
                        <DialogTitle>Size Chart</DialogTitle>
                      </DialogHeader>
                      <img
                        src="/size-chart.jpg"
                        alt="Kayals Lifestyle Size Chart"
                        className="w-full h-auto rounded-lg"
                      />
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sortSizes(product.sizes).map((size) => {
                    const outOfStock = isSizeOutOfStock(size);
                    return (
                      <button
                        key={size}
                        onClick={() => {
                          if (outOfStock) return;
                          setSelectedSize(size);
                          setActiveImage(0);
                          if (showValidation) setShowValidation(false);
                        }}
                        disabled={outOfStock}
                        className={`min-w-[48px] h-12 px-3 border text-base font-bold transition-all relative ${selectedSize === size
                          ? "border-foreground bg-foreground text-background"
                          : "border-black hover:bg-muted bg-background"
                          } ${outOfStock ? "opacity-40 cursor-not-allowed line-through" : ""}`}
                        title={outOfStock ? "Out of Stock" : ""}
                      >
                        {size}
                        {outOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <X className="w-8 h-8 text-black/40 stroke-[1px]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            <div className="flex items-center gap-4" style={{ paddingTop: '10px' }}>
              <span className="text-sm font-medium">Quantity</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-border bg-background">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="px-3 py-2 hover:bg-muted transition-colors"
                    disabled={quantity <= 1}
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-medium">{quantity}</span>
                  <button
                    onClick={() => {
                      if (availableStock !== null && quantity >= availableStock) {
                        toast.error(`Only ${availableStock} items available in stock`);
                        return;
                      }
                      setQuantity(q => q + 1);
                    }}
                    className="px-3 py-2 hover:bg-muted transition-colors"
                    disabled={availableStock !== null && quantity >= availableStock}
                  >
                    +
                  </button>
                </div>
                {availableStock !== null && (
                  <span className="text-sm text-muted-foreground">
                    ({availableStock} available)
                  </span>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-4">
              <div className="flex flex-row gap-3">
                <Button
                  variant="addToCart"
                  className="flex-1 h-12"
                  disabled={product.isSoldOut}
                  onClick={() => handleAddToCart(false)}
                >
                  {product.isSoldOut ? "SOLD OUT" : "ADD TO CART"}
                </Button>
                <Button
                  variant="buyNow"
                  className="flex-1 h-12"
                  disabled={product.isSoldOut}
                  onClick={() => handleAddToCart(true)}
                >
                  BUY NOW
                </Button>
              </div>
            </div>

            {/* Accordion Sections */}
            <div className="border-t border-border mt-6">
              {/* Description */}
              <div className="border-b border-border">
                <button
                  onClick={() => toggleSection("description")}
                  className="w-full flex items-center justify-between py-4 text-left"
                >
                  <span className="font-medium">Product Details</span>
                  {expandedSection === "description" ? (
                    <CaretUp className="h-4 w-4" />
                  ) : (
                    <CaretDown className="h-4 w-4" />
                  )}
                </button>
                {expandedSection === "description" && (
                  <div className="pb-4 text-sm text-muted-foreground leading-relaxed">
                    {product.shortDescription && (
                      <p className="mb-2">{stripHtml(product.shortDescription)}</p>
                    )}
                    <div
                      dangerouslySetInnerHTML={{
                        __html: product.description || "No description available.",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Shipping & Returns */}
              {(product.shippingPolicy || product.returnPolicy || !product.shippingPolicy) && (
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleSection("shipping")}
                    className="w-full flex items-center justify-between py-4 text-left"
                  >
                    <span className="font-medium">Shipping & Returns</span>
                    {expandedSection === "shipping" ? (
                      <CaretUp className="h-4 w-4" />
                    ) : (
                      <CaretDown className="h-4 w-4" />
                    )}
                  </button>
                  {expandedSection === "shipping" && (
                    <div className="pb-4 text-sm text-muted-foreground leading-relaxed space-y-2">
                      {product.shippingPolicy ? (
                        <div dangerouslySetInnerHTML={{ __html: product.shippingPolicy }} />
                      ) : (
                        <>
                          <p>Free shipping on all orders across India.</p>
                          <p>Delivery time: 15-20 working days</p>
                        </>
                      )}
                      {product.returnPolicy && (
                        <div dangerouslySetInnerHTML={{ __html: product.returnPolicy }} className="mt-2" />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Size & Fit */}
              <div className="border-b border-border">
                <button
                  onClick={() => toggleSection("size")}
                  className="w-full flex items-center justify-between py-4 text-left"
                >
                  <span className="font-medium">Size & Fit</span>
                  {expandedSection === "size" ? (
                    <CaretUp className="h-4 w-4" />
                  ) : (
                    <CaretDown className="h-4 w-4" />
                  )}
                </button>
                {expandedSection === "size" && (
                  <div className="pb-4 text-sm text-muted-foreground leading-relaxed space-y-2">
                    <p>Available sizes: XS, S, M, L, XL, XXL, 3XL, 4XL</p>
                    <p>For size guidance, please refer to our size chart below.</p>
                    <img src="/size-chart.jpg" alt="Size Chart" className="w-full h-auto rounded-lg my-3" />
                    <p>Full lining available (inside)</p>
                    <p>Best quality and best stitching</p>
                  </div>
                )}
              </div>

              {/* Wash Care */}
              {(product.washCare || !product.washCare) && (
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleSection("washcare")}
                    className="w-full flex items-center justify-between py-4 text-left"
                  >
                    <span className="font-medium">Wash Care</span>
                    {expandedSection === "washcare" ? (
                      <CaretUp className="h-4 w-4" />
                    ) : (
                      <CaretDown className="h-4 w-4" />
                    )}
                  </button>
                  {expandedSection === "washcare" && (
                    <div className="pb-4 text-sm text-muted-foreground leading-relaxed space-y-2">
                      {product.washCare ? (
                        <div dangerouslySetInnerHTML={{ __html: product.washCare }} />
                      ) : (
                        <>
                          <p>Machine wash cold with like colors.</p>
                          <p>Do not bleach.</p>
                          <p>Tumble dry low.</p>
                          <p>Warm iron if needed.</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Customer Reviews Section */}
        <section className="border-t border-border pt-10">
          <h2 className="font-heading text-2xl font-semibold text-center mb-8">Customer Reviews</h2>

          <div className="max-w-4xl mx-auto space-y-8">
            {/* Rating Summary */}
            {(() => {
              // Calculate exact average rating and count from reviews
              const approvedReviews = reviews?.filter((r: any) => r.status === 'approved') || [];
              const reviewCount = approvedReviews.length;
              const totalRating = approvedReviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0);
              const averageRating = reviewCount > 0 ? (totalRating / reviewCount).toFixed(1) : "0.0";
              const roundedAverage = Math.round(parseFloat(averageRating));

              // Calculate rating breakdown
              const ratingBreakdown = [5, 4, 3, 2, 1].map(rating => {
                const count = approvedReviews.filter((r: any) => r.rating === rating).length;
                const percentage = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
                return { rating, count, percentage };
              });

              return (
                <div className="flex flex-col md:flex-row gap-8 p-6 bg-muted/30 rounded-xl">
                  {/* Overall Rating */}
                  <div className="text-center md:border-r md:border-border md:pr-8 md:min-w-[180px]">
                    <div className="text-5xl font-bold">{averageRating}</div>
                    <div className="flex justify-center gap-1 my-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-6 h-6 ${star <= roundedAverage ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                         weight="fill" />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</p>
                  </div>

                  {/* Rating Breakdown */}
                  <div className="flex-1 space-y-3">
                    {ratingBreakdown.map(({ rating, count, percentage }) => (
                      <div key={rating} className="flex items-center gap-3">
                        <div className="flex items-center gap-1 min-w-[80px]">
                          <span className="text-sm font-medium w-4">{rating}</span>
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400"  weight="fill" />
                        </div>
                        <div className="flex-1 bg-background rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-yellow-400 h-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground min-w-[40px] text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Write a Review Section */}
            <div className="border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-5">Write a Review</h3>

              {/* Star Rating Input */}
              <div className="mb-5">
                <p className="text-sm font-medium mb-2">Your Rating *</p>
                <div className="flex gap-1" onMouseLeave={() => setHoverRating(0)}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      className="p-1 transition-transform hover:scale-110"
                      onMouseEnter={() => setHoverRating(star)}
                      onClick={() => setRating(star)}
                    >
                      <Star
                        className={`w-8 h-8 transition-colors ${star <= (hoverRating || rating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                          }`}
                       weight="fill" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Review Title */}
              <div className="mb-5">
                <p className="text-sm font-medium mb-2">Review Title</p>
                <input
                  type="text"
                  placeholder="Give your review a title"
                  value={reviewForm.title}
                  onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
                  className="w-full p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>

              {/* Review Text */}
              <div className="mb-5">
                <p className="text-sm font-medium mb-2">Your Review *</p>
                <textarea
                  placeholder="Share your experience with this product..."
                  value={reviewForm.review}
                  onChange={(e) => setReviewForm({ ...reviewForm, review: e.target.value })}
                  className="w-full p-3 border border-border rounded-lg text-sm resize-none h-32 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>

              {/* Image/Video UploadSimple */}
              <div className="mb-5">
                <p className="text-sm font-medium mb-2">Add Photos/Videos</p>
                <div className="flex gap-3 flex-wrap">
                  {reviewFiles.map((file, idx) => {
                    const isVideo = file.startsWith('data:video/');
                    return (
                      <div key={idx} className="relative w-24 h-24 border border-border rounded-xl overflow-hidden">
                        {isVideo ? (
                          <video src={file} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={file} alt="preview" className="w-full h-full object-cover" />
                        )}
                        <button
                          onClick={() => setReviewFiles(files => files.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5"
                        >
                          <CaretDown className="w-4 h-4 rotate-45" />
                        </button>
                        {isVideo && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <span className="text-white text-xs font-medium">VIDEO</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {reviewFiles.length < 5 && (
                    <label className="w-24 h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-foreground hover:bg-muted/50 transition-all">
                      <UploadSimple className="w-6 h-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground mt-1">UploadSimple</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">UploadSimple up to 5 images or videos (max 10MB each)</p>
              </div>

              {/* Name & Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div>
                  <p className="text-sm font-medium mb-2">Your Name *</p>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={reviewForm.name}
                    onChange={(e) => setReviewForm({ ...reviewForm, name: e.target.value })}
                    className="w-full p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Your Email *</p>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={reviewForm.email}
                    onChange={(e) => setReviewForm({ ...reviewForm, email: e.target.value })}
                    className="w-full p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
              </div>

              <Button
                onClick={handleReviewSubmit}
                disabled={isSubmittingReview}
                className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 text-base font-semibold"
              >
                {isSubmittingReview ? <CircleNotch className="animate-spin mr-2" /> : null}
                Submit Review
              </Button>
            </div>

            {/* Customer Reviews List */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">All Reviews ({reviews?.length || 0})</h3>
              </div>

              {isLoadingReviews ? (
                <div className="text-center py-12">
                  <CircleNotch className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : reviews && reviews.length > 0 ? (
                <div className="space-y-6">
                  {reviews.map((review: any) => (
                    <div key={review.id} className="border-b border-border pb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star key={star} className={`w-4 h-4 ${star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}  weight="fill" />
                          ))}
                        </div>
                        <span className="font-semibold">{review.reviewer}</span>
                        <span className="text-xs text-muted-foreground">{new Date(review.date_created).toLocaleDateString()}</span>
                      </div>
                      <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: review.review }} />

                      {/* Display review media (images/videos) */}
                      {review.media && review.media.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {review.media.map((mediaUrl: string, idx: number) => {
                            const isVideo = mediaUrl.match(/\.(mp4|webm|ogg|mov)$/i);
                            return isVideo ? (
                              <video
                                key={idx}
                                src={mediaUrl}
                                controls
                                className="w-32 h-32 object-cover rounded-lg border border-border"
                              />
                            ) : (
                              <a
                                key={idx}
                                href={mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={mediaUrl}
                                  alt={`Review image ${idx + 1}`}
                                  className="w-24 h-24 object-cover rounded-lg border border-border hover:opacity-90 transition-opacity"
                                />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Empty State */
                <div className="text-center py-12 border border-border rounded-xl bg-muted/20">
                  <Star className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h4 className="font-medium text-lg mb-2">No Reviews Yet</h4>
                  <p className="text-sm text-muted-foreground mb-4">Be the first to review this product!</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Trust Badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 py-8 border-t border-b border-border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-sm">Safe Payment</p>
              <p className="text-xs text-muted-foreground">
                Pay with the world's most payment methods
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-sm">Buy With Confidence</p>
              <p className="text-xs text-muted-foreground">GST & MSME Registered brand</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-sm">Free Shipping</p>
              <p className="text-xs text-muted-foreground">
                FREE SHIPPING to All Over India
              </p>
            </div>
          </div>
        </div>

        {/* Recommended Products */}
        {recommendedProducts.length > 0 && (
          <section className="mt-12">
            <h2 className="font-heading text-2xl font-semibold text-center mb-8">
              Recommended Products
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
              {recommendedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* Recently Viewed */}
        {recentlyViewed.length > 0 && (
          <section className="mt-12 mb-8">
            <h2 className="font-heading text-2xl font-semibold text-center mb-8">
              Recently Viewed
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
              {recentlyViewed.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout >
  );
};

export default ProductDetail;
