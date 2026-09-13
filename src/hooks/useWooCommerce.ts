import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product, Category } from "@/types/product";

interface ProductsResponse {
  products: Product[];
  total: number;
  totalPages: number;
  currentPage: number;
}

interface CategoriesResponse {
  categories: Category[];
}

interface ProductsParams {
  category?: string;
  perPage?: number;
  page?: number;
  search?: string;
  tag?: string; // Filter by product tag (ID or slug)
  skipVariations?: boolean; // Skip variation processing for faster list views
  enabled?: boolean; // Whether to enable the query
  status?: string; // Filter by product status (publish, draft, etc.)
  include?: string; // Comma-separated product IDs; results come back in this order
}

export interface Review {
  id: number;
  date_created: string;
  reviewer: string;
  reviewer_email: string;
  review: string;
  rating: number;
  verified: boolean;
  reviewer_avatar_urls: Record<string, string>;
  media?: string[]; // URLs to images/videos stored in Supabase
}

export interface CreateReviewData {
  product_id: number;
  review: string;
  reviewer: string;
  reviewer_email: string;
  rating: number;
  images?: string[]; // base64 strings
}

export interface OrderLineItem {
  product_id: number;
  variation_id?: number;
  quantity: number;
}

export interface CreateOrderData {
  payment_method: string;
  payment_method_title: string;
  set_paid: boolean;
  billing: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    email: string;
    phone: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  line_items: OrderLineItem[];
  meta_data?: {
    key: string;
    value: string;
  }[];
}

export const useWooCommerceProducts = (params: ProductsParams = {}) => {
  const { category, perPage = 20, page = 1, search, tag, skipVariations = false, enabled = true, status = 'publish', include } = params;

  return useQuery({
    queryKey: ["woocommerce-products", category, perPage, page, search, tag, skipVariations, status, include],
    enabled,
    queryFn: async (): Promise<ProductsResponse> => {
      const queryParams = new URLSearchParams();
      if (category && category !== "all") queryParams.set("category", category);
      queryParams.set("per_page", perPage.toString());
      queryParams.set("page", page.toString());
      if (search) queryParams.set("search", search);
      if (tag) queryParams.set("tag", tag);
      if (include) queryParams.set("include", include);
      if (skipVariations) queryParams.set("skip_variations", "true"); // Skip variations for faster loading
      if (status) queryParams.set("status", status);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-products?${queryParams.toString()}`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Products fetch error:", response.status, errorText);
        throw new Error(`Failed to fetch products: ${response.status}`);
      }

      const jsonData = await response.json();
      return jsonData;
    },
    staleTime: 10_000, // 10 seconds - matches edge function cache TTL, prevents refetch on every mount
    refetchOnWindowFocus: true, // Refresh when user returns
    gcTime: 1000 * 60 * 2, // Keep in cache for 2 min
    refetchOnMount: true, // Skips refetch if data is fresh (within staleTime)
    notifyOnChangeProps: ['data', 'error'],
  });
};

// Infinite scroll hook for progressive loading
export const useWooCommerceProductsInfinite = (params: Omit<ProductsParams, 'page'> = {}) => {
  const { category, perPage = 24, search, skipVariations = false, status = 'publish' } = params;

  return useInfiniteQuery({
    queryKey: ["woocommerce-products-infinite", category, perPage, search, skipVariations, status],
    queryFn: async ({ pageParam = 1 }): Promise<ProductsResponse> => {
      const queryParams = new URLSearchParams();
      if (category && category !== "all") queryParams.set("category", category);
      queryParams.set("per_page", perPage.toString());
      queryParams.set("page", pageParam.toString());
      if (search) queryParams.set("search", search);
      if (skipVariations) queryParams.set("skip_variations", "true");
      if (status) queryParams.set("status", status);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-products?${queryParams.toString()}`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Products fetch error:", response.status, errorText);
        throw new Error(`Failed to fetch products: ${response.status}`);
      }

      return response.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      // If we have more pages, return next page number
      if (lastPage.currentPage < lastPage.totalPages) {
        return lastPage.currentPage + 1;
      }
      return undefined; // No more pages
    },
    initialPageParam: 1,
    staleTime: 10_000, // 10 seconds - matches edge function cache TTL
    refetchOnWindowFocus: true, // Refresh when user returns
    gcTime: 1000 * 60 * 2, // Keep in cache for 2 min
    refetchOnMount: true, // Skips refetch if data is fresh (within staleTime)
  });
};

export const useWooCommerceCategories = () => {
  return useQuery({
    queryKey: ["woocommerce-categories"],
    queryFn: async (): Promise<CategoriesResponse> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-categories`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Categories fetch error:", response.status, errorText);
        throw new Error(`Failed to fetch categories: ${response.status}`);
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 60, // Cache for 60 minutes
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
    refetchOnMount: false, // Use cached data if available
  });
};

export const useWooCommerceProduct = (slug: string) => {
  return useQuery({
    queryKey: ["woocommerce-product", slug],
    queryFn: async (): Promise<Product | null> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-products?search=${encodeURIComponent(slug)}&per_page=1&status=publish`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch product");
      }

      const data = await response.json();
      return data.products?.find((p: Product) => p.slug === slug) || null;
    },
    enabled: !!slug,
  });
};

export interface PaymentGateway {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  order: number;
}

export const useWooCommercePaymentGateways = () => {
  return useQuery({
    queryKey: ["woocommerce-payment-gateways"],
    queryFn: async (): Promise<PaymentGateway[]> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-payment-gateways`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Payment gateways fetch error:", response.status, errorText);
        throw new Error(`Failed to fetch payment gateways: ${response.status}`);
      }

      const data = await response.json();
      console.log("Payment gateways response:", data);
      return data.gateways || [];
    },
    staleTime: 0, // Always fetch fresh
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
};

// Fast initial product load (basic data + main variation images, no gallery)
export const useWooCommerceProductById = (id: string) => {
  return useQuery({
    queryKey: ["woocommerce-product-id-fast", id],
    queryFn: async (): Promise<Product | null> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Use skip_variations=true for fast initial load (gets basic variation images)
      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-products?id=${id}&skip_variations=true&status=publish`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          cache: "no-store", // Bypass browser HTTP cache for real-time stock
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Product fetch error:", response.status, errorText);
        throw new Error(`Failed to fetch product: ${response.status}`);
      }

      const data = await response.json();
      const product = data.products?.[0] || null;

      // Debug: Log dispatch time in frontend
      if (product) {
        console.log("Frontend received product:", {
          id: product.id,
          name: product.name,
          dispatchTime: product.dispatchTime,
          hasDispatchTime: !!product.dispatchTime
        });
      }

      return product;
    },
    enabled: !!id,
    staleTime: 0, // Always stale - refetch for fresh stock data
    gcTime: 1000 * 60 * 2, // Keep in cache 2 min
    refetchOnWindowFocus: true, // Refresh when user returns
    refetchOnMount: 'always', // Always refetch on mount for fresh stock
  });
};

// Background load for full variation gallery images
export const useWooCommerceProductGallery = (id: string, productType?: string) => {
  return useQuery({
    queryKey: ["woocommerce-product-gallery", id],
    queryFn: async (): Promise<Product | null> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Full load with all variation gallery images
      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-products?id=${id}&status=publish`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          cache: "no-store", // Bypass browser HTTP cache for real-time stock
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Product gallery fetch error:", response.status, errorText);
        throw new Error(`Failed to fetch product gallery: ${response.status}`);
      }

      const data = await response.json();
      return data.products?.[0] || null;
    },
    // Only fetch gallery for variable products
    enabled: !!id && productType === 'variable',
    staleTime: 0, // Always stale - refetch for fresh stock data
    gcTime: 1000 * 60 * 2, // Keep in cache 2 min
    refetchOnWindowFocus: true, // Refresh when user returns
    refetchOnMount: 'always', // Always refetch for fresh stock
  });
};

export const useWooCommerceReviews = (productId: string | number) => {
  return useQuery({
    queryKey: ["woocommerce-reviews", productId],
    queryFn: async (): Promise<Review[]> => {
      if (!productId) return [];

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      console.log("Fetching reviews for product:", productId);

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/woocommerce-reviews?product_id=${productId}`,
          {
            method: "GET",
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Failed to fetch reviews:", response.status, errorText);
          return [];
        }

        const data = await response.json();
        console.log("Reviews response:", data);
        return data.reviews || [];
      } catch (error) {
        console.error("Error fetching reviews:", error);
        return [];
      }
    },
    enabled: !!productId,
    staleTime: 0, // Always refetch for fresh reviews
    gcTime: 1000 * 60 * 5, // Keep in cache 5 min
    refetchOnWindowFocus: true, // Refresh when user returns
    refetchOnMount: true, // Always refetch for latest approved reviews
    placeholderData: (previousData) => previousData,
  });
};

export const useSubmitWooCommerceReview = () => {
  return async (data: CreateReviewData) => {
    console.log("Submitting review with data:", {
      product_id: data.product_id,
      reviewer: data.reviewer,
      rating: data.rating,
      imagesCount: data.images?.length || 0
    });

    const { data: responseData, error } = await supabase.functions.invoke("woocommerce-reviews", {
      body: data,
    });

    if (error) {
      console.error("Error submitting review:", error);
      throw error;
    }

    console.log("Review submission response:", responseData);
    return responseData;
  };
};

export const useCreateOrder = () => {
  return async (orderData: CreateOrderData) => {
    console.log("Creating order with data:", orderData);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-orders`,
        {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderData),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Order creation failed:", response.status, errorText);
        throw new Error(`Failed to create order: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();
      console.log("Order creation response:", responseData);
      return responseData;
    } catch (error) {
      console.error("Error creating order:", error);
      throw error;
    }
  };
};

// Orders
export interface WooCommerceOrder {
  id: number;
  status: string;
  date_created: string;
  date_modified: string;
  total: string;
  currency: string;
  payment_method_title: string;
  billing: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    email: string;
    phone: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    quantity: number;
    total: string;
    meta_data?: Array<{ key: string; value: string }>;
  }>;
}

export const useUserOrders = (email?: string, phone?: string) => {
  return useQuery({
    queryKey: ["user-orders", email, phone],
    enabled: !!(email || phone),
    queryFn: async (): Promise<WooCommerceOrder[]> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const params = new URLSearchParams();
      if (email) params.set("email", email);
      if (phone) params.set("phone", phone);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-orders?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to fetch orders:", response.status, errorText);
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }

      const data = await response.json();
      return data.orders || [];
    },
  });
};

// WordPress Pages
export interface WordPressPage {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  date: string;
  modified: string;
  featuredImage: string | null;
}

export const useWordPressPage = (slug: string) => {
  return useQuery({
    queryKey: ["wordpress-page", slug],
    queryFn: async (): Promise<WordPressPage | null> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-pages?slug=${encodeURIComponent(slug)}`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Page fetch error:", response.status, errorText);
        throw new Error(`Failed to fetch page: ${response.status}`);
      }

      const data = await response.json();
      return data.pages?.[0] || null;
    },
    enabled: !!slug,
    staleTime: 0, // Always refetch for fresh content
    gcTime: 1000 * 60 * 5, // Keep in cache 5 min
    refetchOnWindowFocus: true, // Refresh when user returns
    refetchOnMount: true, // Always refetch on mount for latest content
    placeholderData: (previousData) => previousData,
  });
};

export const useWordPressPages = () => {
  return useQuery({
    queryKey: ["wordpress-pages"],
    queryFn: async (): Promise<WordPressPage[]> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-pages`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Pages fetch error:", response.status, errorText);
        throw new Error(`Failed to fetch pages: ${response.status}`);
      }

      const data = await response.json();
      return data.pages || [];
    },
    staleTime: 0, // Always refetch for fresh content
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  });
};

const transformWpItem = (item: { id: number; title?: { rendered?: string }; slug?: string; content?: { rendered?: string }; excerpt?: { rendered?: string }; date?: string; modified?: string; featured_media?: number }): WordPressPage => ({
  id: item.id,
  title: item.title?.rendered || "",
  slug: item.slug || "",
  content: item.content?.rendered || "",
  excerpt: item.excerpt?.rendered || "",
  date: item.date || "",
  modified: item.modified || "",
  featuredImage: item.featured_media != null ? String(item.featured_media) : null,
});

/** Fetch from WordPress REST API directly: try pages then posts for each slug. */
async function fetchPageFromWordPressDirect(baseUrl: string, slugs: string[]): Promise<WordPressPage | null> {
  const url = baseUrl.replace(/\/+$/, "");
  for (const s of slugs) {
    const slug = s.trim();
    if (!slug) continue;
    for (const type of ["pages", "posts"] as const) {
      try {
        const res = await fetch(`${url}/wp-json/wp/v2/${type}?slug=${encodeURIComponent(slug)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) continue;
        const data = await res.json();
        const item = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (item) return transformWpItem(item);
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** Fetch a single page by trying multiple slugs in order. Tries pages first, then posts.
 * Uses VITE_WORDPRESS_URL to fetch directly from WordPress when set; falls back to Supabase function on error or when unset. */
export const useWordPressPageBySlugs = (slugs: string[]) => {
  const slugsKey = slugs.join(",");
  const wpUrl = import.meta.env.VITE_WORDPRESS_URL as string | undefined;
  return useQuery({
    queryKey: ["wordpress-page-by-slugs", slugsKey, wpUrl || "supabase"],
    queryFn: async (): Promise<WordPressPage | null> => {
      if (!slugs.length) return null;

      if (wpUrl) {
        try {
          const page = await fetchPageFromWordPressDirect(wpUrl, slugs);
          if (page) return page;
        } catch (e) {
          console.warn("Direct WordPress fetch failed, falling back to Supabase:", e);
        }
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/woocommerce-pages?slugs=${encodeURIComponent(slugsKey)}`,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!response.ok) {
        const t = await response.text();
        console.error("Page-by-slugs fetch error:", response.status, t);
        throw new Error(`Failed to fetch page: ${response.status}`);
      }
      const data = await response.json();
      return data.pages?.[0] || null;
    },
    enabled: slugs.length > 0,
    staleTime: 0, // Always refetch for fresh content
    gcTime: 1000 * 60 * 5, // Keep in cache 5 min
    refetchOnWindowFocus: true, // Refresh when user returns
    refetchOnMount: true, // Always refetch on mount for latest content
    placeholderData: (previousData) => previousData,
  });
};

// Home Banners
export interface HomeBanner {
  id: number;
  image_url: string;
  mobile_image_url: string | null;
  redirect_link: string;
  alt_text: string;
  is_active: boolean;
  display_order: number;
}

export const useHomeBanners = () => {
  return useQuery({
    queryKey: ["home-banners"],
    queryFn: async (): Promise<HomeBanner[]> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/home-banners`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        console.error("Banners fetch error:", response.status);
        return [];
      }

      const data = await response.json();
      return data.banners || [];
    },
    staleTime: 0, // Always refetch for fresh banner data
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};
