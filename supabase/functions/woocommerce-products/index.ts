import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Smart tiered caching: listings get 10s (sufficient for 1000+ concurrent users), detail gets 2s (near-real-time for add-to-cart)
const listCacheHeaders = { ...corsHeaders, 'Cache-Control': 'public, max-age=10, stale-while-revalidate=5' };
const detailCacheHeaders = { ...corsHeaders, 'Cache-Control': 'public, max-age=2, stale-while-revalidate=3' };

// In-memory response cache (persists across requests within the same Deno isolate, typically 30-60s)
const responseCache = new Map<string, { data: string; timestamp: number }>();
const LIST_CACHE_TTL = 10_000;   // 10 seconds for listings
const DETAIL_CACHE_TTL = 2_000;  // 2 seconds for detail

// Tag slug → ID cache (tags rarely change)
const tagSlugCache = new Map<string, { id: number; timestamp: number }>();
const TAG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// L2 DB cache TTLs (shared across all isolates)
const DB_CACHE_FRESH_TTL = 10_000;  // 10s — serve immediately, no revalidation
const DB_CACHE_STALE_TTL = 60_000;  // 60s — serve stale data instantly, revalidate in background
// In-memory set to prevent multiple revalidations from the same isolate
const revalidatingKeys = new Set<string>();

// Lazy Supabase client for DB cache
const getSupabaseClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase credentials not configured');
  return createClient(url, key);
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const storeUrlRaw = Deno.env.get('WOOCOMMERCE_STORE_URL');
    const consumerKey = Deno.env.get('WOOCOMMERCE_CONSUMER_KEY');
    const consumerSecret = Deno.env.get('WOOCOMMERCE_CONSUMER_SECRET');

    if (!storeUrlRaw || !consumerKey || !consumerSecret) {
      console.error('Missing WooCommerce credentials');
      throw new Error('WooCommerce credentials not configured');
    }

    // Remove trailing slash to prevent double slashes in URL
    const storeUrl = storeUrlRaw.replace(/\/+$/, '');

    const authHeader = 'Basic ' + btoa(`${consumerKey}:${consumerSecret}`);

    const url = new URL(req.url);
    const productId = url.searchParams.get('id');
    const categoryId = url.searchParams.get('category');
    const perPage = url.searchParams.get('per_page') || '20';
    const page = url.searchParams.get('page') || '1';
    const search = url.searchParams.get('search') || '';
    const skipVariations = url.searchParams.get('skip_variations') === 'true'; // Skip variations for list views
    const status = url.searchParams.get('status') || 'publish';
    const tag = url.searchParams.get('tag') || '';
    // Explicit ID list (homepage rails); WooCommerce returns them in the given order with orderby=include
    const include = (url.searchParams.get('include') || '').split(',').filter((id) => /^\d+$/.test(id)).join(',');

    // Build cache key from all query parameters
    const cacheKey = `${productId || 'list'}:${categoryId}:${page}:${perPage}:${search}:${tag}:${include}:${skipVariations}:${status}`;
    const cacheTTL = productId ? DETAIL_CACHE_TTL : LIST_CACHE_TTL;
    const cacheHeaders = productId ? detailCacheHeaders : listCacheHeaders;

    // L1: In-memory cache (same isolate, ~0ms)
    const cached = responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < cacheTTL) {
      console.log(`L1 cache hit for key: ${cacheKey}`);
      return new Response(cached.data, {
        headers: { ...cacheHeaders, 'Content-Type': 'application/json' },
      });
    }

    // L2: Supabase DB cache (shared across all isolates, ~50ms)
    // Uses stale-while-revalidate: fresh (<10s) = instant, stale (10-60s) = serve + background refresh, expired (>60s) = fetch
    let supabase: ReturnType<typeof getSupabaseClient> | null = null;
    try {
      supabase = getSupabaseClient();
      const { data: dbCached, error: dbError } = await supabase
        .from('product_cache')
        .select('response_data, cached_at')
        .eq('cache_key', cacheKey)
        .single();

      if (!dbError && dbCached) {
        const cachedAge = Date.now() - new Date(dbCached.cached_at).getTime();

        if (cachedAge < DB_CACHE_STALE_TTL) {
          const responseBody = JSON.stringify(dbCached.response_data);
          // Populate L1 cache for subsequent same-isolate hits
          responseCache.set(cacheKey, { data: responseBody, timestamp: Date.now() });

          if (cachedAge < DB_CACHE_FRESH_TTL) {
            console.log(`L2 DB cache FRESH hit for key: ${cacheKey} (age: ${cachedAge}ms)`);
          } else {
            console.log(`L2 DB cache STALE hit for key: ${cacheKey} (age: ${cachedAge}ms) — serving stale`);
          }

          return new Response(responseBody, {
            headers: { ...cacheHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          console.log(`L2 DB cache EXPIRED for key: ${cacheKey} (age: ${cachedAge}ms)`);
        }
      }
    } catch (dbErr) {
      console.error('L2 DB cache check failed (proceeding to WooCommerce):', dbErr);
    }

    console.log(`Cache miss for key: ${cacheKey} — fetching from WooCommerce`);

    // Build WooCommerce API URL
    let apiUrl: string;

    // If fetching single product by ID
    if (productId) {
      apiUrl = `${storeUrl}/wp-json/wc/v3/products/${productId}?meta_data=true`;
    } else {
      // Include meta_data in the response for product list
      apiUrl = `${storeUrl}/wp-json/wc/v3/products?per_page=${perPage}&page=${page}&meta_data=true&status=${status}`;

      if (categoryId && categoryId !== 'all') {
        apiUrl += `&category=${categoryId}`;
      }

      if (search) {
        apiUrl += `&search=${encodeURIComponent(search)}`;
      }

      if (include) {
        apiUrl += `&include=${include}&orderby=include`;
      }

      // Tag filter - supports tag ID (numeric) or tag slug (text)
      if (tag) {
        if (/^\d+$/.test(tag)) {
          // Numeric tag ID - use directly
          apiUrl += `&tag=${tag}`;
        } else {
          // Tag slug - resolve to ID (with in-memory cache)
          const cachedTag = tagSlugCache.get(tag);
          if (cachedTag && (Date.now() - cachedTag.timestamp) < TAG_CACHE_TTL) {
            apiUrl += `&tag=${cachedTag.id}`;
            console.log(`Tag slug "${tag}" resolved from cache to ID ${cachedTag.id}`);
          } else {
            try {
              const tagResponse = await fetch(
                `${storeUrl}/wp-json/wc/v3/products/tags?slug=${encodeURIComponent(tag)}`,
                {
                  method: 'GET',
                  headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                }
              );
              if (tagResponse.ok) {
                const tags = await tagResponse.json();
                if (tags.length > 0) {
                  apiUrl += `&tag=${tags[0].id}`;
                  tagSlugCache.set(tag, { id: tags[0].id, timestamp: Date.now() });
                  console.log(`Resolved tag slug "${tag}" to ID ${tags[0].id}`);
                } else {
                  console.warn(`Tag slug "${tag}" not found`);
                }
              }
            } catch (err) {
              console.error(`Error resolving tag slug "${tag}":`, err);
            }
          }
        }
      }
    }

    console.log('Fetching products from:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    const contentType = response.headers.get('content-type');
    const responseText = await response.text();

    if (!response.ok) {
      console.error('WooCommerce API error:', response.status, responseText);
      throw new Error(`WooCommerce API error: ${response.status}`);
    }

    // Sometimes WooCommerce/WordPress returns an HTML login/redirect page with 200 OK.
    // In that case JSON.parse will fail with "Unexpected token '<'".
    if (!contentType?.includes('application/json')) {
      console.error('WooCommerce returned non-JSON response', {
        status: response.status,
        contentType,
        url: response.url,
        preview: responseText.slice(0, 200),
      });
      throw new Error(
        `WooCommerce did not return JSON (content-type: ${contentType || 'unknown'}). ` +
        `Check WOOCOMMERCE_STORE_URL (should be your public WordPress site, not an admin/login page) and API access. ` +
        `Response preview: ${responseText.slice(0, 120)}`
      );
    }

    let responseData = JSON.parse(responseText);
    const totalProducts = response.headers.get('X-WP-Total');
    const totalPages = response.headers.get('X-WP-TotalPages');

    // Filter out non-published products
    if (productId) {
      // Single product: check if it's published
      if (responseData.status && responseData.status !== 'publish') {
        console.log(`Product ${productId} is not published (status: ${responseData.status}), returning empty`);
        return new Response(
          JSON.stringify({ products: [], total: 0, totalPages: 0, currentPage: parseInt(page) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Product list: filter out any non-published products as safety net
      if (Array.isArray(responseData)) {
        const before = responseData.length;
        responseData = responseData.filter((p: any) => !p.status || p.status === 'publish');
        if (responseData.length < before) {
          console.log(`Filtered out ${before - responseData.length} non-published products from list`);
        }
      }
    }

    // Helper function to fetch variations for a product
    const fetchVariations = async (productId: string): Promise<any[]> => {
      try {
        const variationsUrl = `${storeUrl}/wp-json/wc/v3/products/${productId}/variations?per_page=100`;
        console.log(`Fetching variations from: ${variationsUrl}`);
        const variationsResponse = await fetch(variationsUrl, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (variationsResponse.ok) {
          const variations = await variationsResponse.json();
          console.log(`Found ${variations.length} variations for product ${productId}`);
          if (variations.length > 0) {
            console.log(`First variation sample:`, JSON.stringify(variations[0], null, 2));
          }
          return variations;
        } else {
          console.error(`Failed to fetch variations: ${variationsResponse.status}`);
        }
      } catch (err) {
        console.error(`Error fetching variations for product ${productId}:`, err);
      }
      return [];
    };

    // Helper function to fetch media by ID (fallback if not in product images)
    const fetchMediaUrl = async (mediaId: string): Promise<string | null> => {
      try {
        const mediaUrl = `${storeUrl}/wp-json/wp/v2/media/${mediaId}`;
        const mediaResponse = await fetch(mediaUrl, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json();
          return mediaData.source_url || mediaData.guid?.rendered || mediaData.media_details?.sizes?.full?.source_url || null;
        }
      } catch (err) {
        console.error(`Error fetching media ${mediaId}:`, err);
      }
      return null;
    };

    // Transform product helper function
    const transformProduct = async (product: any) => {
      let allVariationsData: any[] = [];

      // Fast path: if skipping variations, do minimal processing
      if (skipVariations) {
        // Helper to extract fields from ACF and meta_data
        let dispatchTime: string | undefined = undefined;
        const extractField = (keys: string[]) => {
          // Log keys for debugging if it's a specific product (or just first few)
          if (product.meta_data && Array.isArray(product.meta_data) && product.meta_data.length > 0) {
            console.log(`Product ${product.id} meta keys:`, product.meta_data.map(m => m.key).join(', '));
          }
          // Check ACF
          if (product.acf && typeof product.acf === 'object') {
            for (const key of keys) {
              if (product.acf[key]) {
                const val = String(product.acf[key]).trim();
                if (val && val !== '0' && val.toLowerCase() !== 'false') return val;
              }
            }
          }
          // Check Meta Data
          if (product.meta_data && Array.isArray(product.meta_data)) {
            for (const meta of product.meta_data) {
              const normalizedMetaKey = (meta.key || '').toLowerCase().trim().replace(/^\_+/, '').replace(/\s+/g, '_');
              for (const key of keys) {
                const normalizedKey = key.toLowerCase().trim().replace(/^\_+/, '').replace(/\s+/g, '_');
                if (normalizedMetaKey === normalizedKey && meta.value) {
                  const val = String(meta.value).trim();
                  if (val && val !== '0' && val.toLowerCase() !== 'false') return val;
                }
              }
            }
          }
          return undefined;
        };

        dispatchTime = extractField(['dispatch_time', 'dispatchtime', 'shipping_time']);
        const shippingPolicy = extractField(['shipping_policy', 'shipping']);
        const returnPolicy = extractField(['return_policy', 'returns', 'return']);
        const washCare = extractField(['wash_care', 'washing_instructions', 'washcare']);

        if (dispatchTime && !dispatchTime.toLowerCase().includes('day') && /^\d+$/.test(dispatchTime)) {
          dispatchTime = `${dispatchTime} days`;
        }

        return {
          id: product.id.toString(),
          name: product.name,
          slug: product.slug,
          price: parseFloat(product.price) || 0,
          originalPrice: product.regular_price ? parseFloat(product.regular_price) : undefined,
          discount: product.on_sale && product.regular_price
            ? Math.round(((parseFloat(product.regular_price) - parseFloat(product.price)) / parseFloat(product.regular_price)) * 100)
            : undefined,
          images: product.images?.map((img: any) => img.src).filter(Boolean) || [],
          colors: product.attributes
            ?.find((attr: any) => attr.name.toLowerCase() === 'color' || attr.name.toLowerCase() === 'colour')
            ?.options || [],
          sizes: product.attributes
            ?.find((attr: any) => attr.name.toLowerCase() === 'size')
            ?.options || [],
          category: product.categories?.[0]?.name || 'Uncategorized',
          categorySlug: product.categories?.[0]?.slug || 'uncategorized',
          categoryId: product.categories?.[0]?.id?.toString() || '',
          isNew: product.featured,
          isSoldOut: product.stock_status === 'outofstock',
          description: product.description,
          shortDescription: product.short_description,
          inStock: product.stock_status === 'instock',
          stockQuantity: product.stock_quantity !== null && product.stock_quantity !== undefined
            ? parseInt(product.stock_quantity)
            : null,
          dispatchTime: dispatchTime,
          shippingPolicy: shippingPolicy,
          returnPolicy: returnPolicy,
          washCare: washCare,
          sku: product.sku,
          type: product.type,
          averageRating: product.average_rating,
          ratingCount: product.rating_count,
          variations: allVariationsData.length > 0 ? allVariationsData : undefined,
        };
      }

      // Full processing path (for product detail pages)
      // Get main product images
      const mainImages = product.images?.map((img: any) => img.src) || [];

      // Build image ID to URL map from product images (will be extended with variation images)
      const imageIdToUrl: Record<string, string> = {};
      product.images?.forEach((img: any) => {
        if (img.id && img.src) {
          imageIdToUrl[img.id.toString()] = img.src;
        }
      });
      console.log(`Product ${product.id} initial image ID map: ${Object.keys(imageIdToUrl).length} images`);

      // Helper to resolve image ID to URL using the map first, then fallback to API
      const resolveImageUrl = async (imageId: string): Promise<string | null> => {
        // Normalize image ID
        const normalizedId = String(imageId).trim();
        if (!normalizedId || isNaN(Number(normalizedId))) {
          console.log(`Invalid image ID: ${imageId}`);
          return null;
        }

        // First check if it's in the images map (includes product + variation images)
        if (imageIdToUrl[normalizedId]) {
          console.log(`Image ${normalizedId} found in images map`);
          return imageIdToUrl[normalizedId];
        }

        // Fallback to fetching from media API
        console.log(`Image ${normalizedId} not in map, trying media API`);
        const url = await fetchMediaUrl(normalizedId);

        // Cache it if found
        if (url) {
          imageIdToUrl[normalizedId] = url;
        }

        return url;
      };

      // Initialize variation images array
      let variationImages: { color: string; images: string[]; attributes: any[]; id: number; stockQuantity?: number | null; stockStatus?: string }[] = [];
      let allVariationImageUrls: string[] = [];

      // If product is variable, fetch variations (skip if skipVariations flag is set for performance)
      console.log(`Product ${product.id} type: ${product.type}, variations count: ${product.variations?.length || 0}, skipVariations: ${skipVariations}`);

      if (product.type === 'variable' && !skipVariations) {
        const variations = await fetchVariations(product.id.toString());
        console.log(`Fetched ${variations.length} variations for product ${product.id}`);

        // Add variation images to the map BEFORE processing gallery images
        variations.forEach((variation: any) => {
          if (variation.image?.id && variation.image?.src) {
            imageIdToUrl[variation.image.id.toString()] = variation.image.src;
          }
        });
        console.log(`Updated image ID map with variation images: ${Object.keys(imageIdToUrl).length} total images`);

        // Group variations by color to merge images from multiple variations with same color
        const colorVariationMap: Record<string, { images: string[]; variations: any[] }> = {};

        for (const variation of variations) {
          const colorAttr = variation.attributes?.find(
            (attr: any) => attr.name?.toLowerCase() === 'color' || attr.name?.toLowerCase() === 'colour'
          );
          // Normalize color name for consistent matching
          const colorName = colorAttr?.option ? colorAttr.option.trim() : 'Default';
          console.log(`Variation ${variation.id} color: ${colorName}`);
          console.log(`Variation ${variation.id} has main image:`, !!variation.image?.src);

          // Initialize color entry if not exists
          if (!colorVariationMap[colorName]) {
            colorVariationMap[colorName] = { images: [], variations: [] };
          }

          // Track this variation
          colorVariationMap[colorName].variations.push(variation);

          // Get variation's main image
          const variationMainImage = variation.image?.src;

          // Add main image if it exists and not already in the list
          if (variationMainImage && !colorVariationMap[colorName].images.includes(variationMainImage)) {
            colorVariationMap[colorName].images.push(variationMainImage);
            allVariationImageUrls.push(variationMainImage);
            console.log(`Added main image for variation ${variation.id}, color ${colorName}`);
          }

          // Check multiple possible meta keys for additional variation images
          // Extended list to support various WooCommerce variation gallery plugins
          const possibleMetaKeys = [
            'wpcvi_images', // Primary key from the logs
            '_woo_variation_gallery_images', // Primary key for WooCommerce variation gallery plugin
            '_wc_additional_variation_images',
            'woo_variation_gallery_images',
            'variation_image_gallery',
            '_product_image_gallery',
            'wc_additional_variation_images',
            '_variation_images',
            'variation_images',
            'gallery_images',
            '_gallery_images',
            'product_image_gallery',
            'woodmart_variation_gallery_data', // Woodmart theme
            '_woodmart_variation_gallery', // Woodmart theme
            'rtwpvg_images', // Variation Images Gallery plugin
            '_rtwpvg_images',
            'wvg_gallery_images', // WooCommerce Variation Gallery
            '_wvg_gallery_images',
          ];

          const allImageIds: string[] = [];

          console.log(`Variation ${variation.id} available meta keys:`, variation.meta_data?.map((m: any) => m.key));

          // Collect image IDs from all matching meta keys
          for (const metaKey of possibleMetaKeys) {
            const additionalImagesMeta = variation.meta_data?.find(
              (meta: any) => meta.key === metaKey
            );

            if (additionalImagesMeta?.value) {
              console.log(`Found meta key ${metaKey} with value:`, additionalImagesMeta.value);

              // Handle multiple formats: JSON array, comma-separated string, single number, array, or object
              let imageIds: string[] = [];
              const value = additionalImagesMeta.value;

              if (typeof value === 'string') {
                const trimmedValue = value.trim();
                if (!trimmedValue) continue;

                try {
                  const parsed = JSON.parse(trimmedValue);
                  if (Array.isArray(parsed)) {
                    imageIds = parsed.map((id: any) => String(id).trim()).filter((id: string) => id && !isNaN(Number(id)));
                  } else if (typeof parsed === 'number') {
                    imageIds = [String(parsed)];
                  } else if (typeof parsed === 'object' && parsed !== null) {
                    // Some plugins store as object with numeric keys or nested structure
                    const extractIds = (obj: any): string[] => {
                      const result: string[] = [];
                      if (Array.isArray(obj)) {
                        return obj.map((id: any) => String(id).trim()).filter((id: string) => id && !isNaN(Number(id)));
                      }
                      for (const val of Object.values(obj)) {
                        if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
                          result.push(String(val).trim());
                        } else if (typeof val === 'object' && val !== null) {
                          result.push(...extractIds(val));
                        }
                      }
                      return result;
                    };
                    imageIds = extractIds(parsed);
                  }
                } catch {
                  // Not JSON, treat as comma-separated or single value
                  if (trimmedValue.includes(',')) {
                    imageIds = trimmedValue.split(',').map((id: string) => id.trim()).filter((id: string) => id && !isNaN(Number(id)));
                  } else if (!isNaN(Number(trimmedValue))) {
                    imageIds = [trimmedValue];
                  }
                }
              } else if (Array.isArray(value)) {
                imageIds = value.map((id: any) => String(id).trim()).filter((id: string) => id && !isNaN(Number(id)));
              } else if (typeof value === 'number') {
                imageIds = [String(value)];
              } else if (typeof value === 'object' && value !== null) {
                // Handle object format - extract all numeric values
                const extractIds = (obj: any): string[] => {
                  const result: string[] = [];
                  if (Array.isArray(obj)) {
                    return obj.map((id: any) => String(id).trim()).filter((id: string) => id && !isNaN(Number(id)));
                  }
                  for (const val of Object.values(obj)) {
                    if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
                      result.push(String(val).trim());
                    } else if (typeof val === 'object' && val !== null) {
                      result.push(...extractIds(val));
                    }
                  }
                  return result;
                };
                imageIds = extractIds(value);
              }

              // Filter to ensure valid numeric IDs
              imageIds = imageIds.filter((id: string) => {
                const numId = Number(id);
                return id && !isNaN(numId) && numId > 0;
              });

              if (imageIds.length > 0) {
                console.log(`Extracted image IDs for variation ${variation.id} from ${metaKey}:`, imageIds);
                allImageIds.push(...imageIds);
              }
            }
          }

          // Fetch all unique image IDs
          if (allImageIds.length > 0) {
            const uniqueImageIds = [...new Set(allImageIds)];
            console.log(`Total unique image IDs for variation ${variation.id}:`, uniqueImageIds);
            const imagePromises = uniqueImageIds.map((id: string) => resolveImageUrl(id.trim()));
            const fetchedImages = await Promise.all(imagePromises);
            const validImages = fetchedImages.filter((url): url is string => url !== null);

            // Add gallery images that aren't already in the list
            validImages.forEach(url => {
              if (!colorVariationMap[colorName].images.includes(url)) {
                colorVariationMap[colorName].images.push(url);
                allVariationImageUrls.push(url);
              }
            });
            console.log(`Added ${validImages.length} gallery images for variation ${variation.id}, color ${colorName}`);
          } else {
            console.log(`Variation ${variation.id} has no gallery images in meta_data`);
          }
        }

        // Build variation images array from grouped data
        // Store all variations with their stock data (not just grouped by color)
        // This allows us to find the exact variation by size+color combination
        for (const variation of variations) {
          const colorAttr = variation.attributes?.find(
            (attr: any) => attr.name?.toLowerCase() === 'color' || attr.name?.toLowerCase() === 'colour'
          );
          const sizeAttr = variation.attributes?.find(
            (attr: any) => attr.name?.toLowerCase() === 'size'
          );
          allVariationsData.push({
            id: variation.id,
            color: colorAttr?.option?.trim() || 'Default',
            size: sizeAttr?.option?.trim() || null,
            stockQuantity: variation.stock_quantity !== null && variation.stock_quantity !== undefined
              ? parseInt(variation.stock_quantity)
              : null,
            stockStatus: variation.stock_status || 'instock',
            manageStock: variation.manage_stock || false,
          });
        }

        // Build variation images array from grouped data (for display)
        // Use the first variation's attributes for each color group
        for (const [colorName, colorData] of Object.entries(colorVariationMap)) {
          if (colorData.images.length > 0) {
            const firstVariation = colorData.variations[0];
            // Find minimum stock across all variations of this color (for display)
            const colorVariations = allVariationsData.filter(v => v.color === colorName);
            const minStock = colorVariations.length > 0
              ? Math.min(...colorVariations.map(v => v.stockQuantity ?? Infinity).filter(q => q !== Infinity))
              : null;

            variationImages.push({
              color: colorName,
              images: [...new Set(colorData.images)].filter(Boolean), // Remove duplicates
              attributes: firstVariation.attributes, // Pass all attributes from first variation
              id: firstVariation.id, // Pass variation ID from first variation
              stockQuantity: minStock !== Infinity ? minStock : null,
              stockStatus: firstVariation.stock_status || 'instock',
            });
            console.log(`Added variation images for color ${colorName}: ${colorData.images.length} images from ${colorData.variations.length} variations`);
          } else {
            console.log(`Warning: Color ${colorName} has no images (${colorData.variations.length} variations)`);
          }
        }
      }

      // Also check product meta_data for additional images
      const productAdditionalImagesMeta = product.meta_data?.find(
        (meta: any) => meta.key === '_wc_additional_variation_images'
      );

      if (productAdditionalImagesMeta?.value) {
        const imageIds = productAdditionalImagesMeta.value.split(',').filter((id: string) => id.trim());
        const imagePromises = imageIds.map((id: string) => resolveImageUrl(id.trim()));
        const fetchedImages = await Promise.all(imagePromises);
        const validImages = fetchedImages.filter((url): url is string => url !== null);
        allVariationImageUrls.push(...validImages);
      }

      // Combine all images (main + variation) removing duplicates
      const allImages = [...new Set([...mainImages, ...allVariationImageUrls])];

      // Helper to extract fields from ACF and meta_data
      let dispatchTime: string | undefined = undefined;
      const extractField = (keys: string[]) => {
        if (product.meta_data && Array.isArray(product.meta_data) && product.meta_data.length > 0) {
          console.log(`Product ${product.id} meta keys:`, product.meta_data.map(m => m.key).join(', '));
        }
        // Check ACF
        if (product.acf && typeof product.acf === 'object') {
          for (const key of keys) {
            if (product.acf[key]) {
              const val = String(product.acf[key]).trim();
              if (val && val !== '0' && val.toLowerCase() !== 'false') return val;
            }
          }
        }
        // Check Meta Data
        if (product.meta_data && Array.isArray(product.meta_data)) {
          for (const meta of product.meta_data) {
            const normalizedMetaKey = (meta.key || '').toLowerCase().trim().replace(/^\_+/, '').replace(/\s+/g, '_');
            for (const key of keys) {
              const normalizedKey = key.toLowerCase().trim().replace(/^\_+/, '').replace(/\s+/g, '_');
              if (normalizedMetaKey === normalizedKey && meta.value) {
                const val = String(meta.value).trim();
                if (val && val !== '0' && val.toLowerCase() !== 'false') return val;
              }
            }
          }
        }
        // Check Attributes (fallback for things like dispatch time)
        if (product.attributes && Array.isArray(product.attributes)) {
          for (const attr of product.attributes) {
            const normalizedAttr = (attr.name || '').toLowerCase().trim().replace(/\s+/g, '_');
            for (const key of keys) {
              if (normalizedAttr.includes(key.toLowerCase()) && attr.options?.[0]) {
                return String(attr.options[0]).trim();
              }
            }
          }
        }
        return undefined;
      };

      dispatchTime = extractField(['dispatch_time', 'dispatchtime', 'shipping_time', 'delivery_time']);
      const shippingPolicy = extractField(['shipping_policy', 'shipping', 'shipping_info', 'delivery_info']);
      const returnPolicy = extractField(['return_policy', 'returns', 'return', 'return_info']);
      const washCare = extractField(['wash_care', 'washing_instructions', 'washcare', 'wash_instructions']);

      if (dispatchTime && !dispatchTime.toLowerCase().includes('day') && /^\d+$/.test(dispatchTime)) {
        dispatchTime = `${dispatchTime} days`;
      }

      if (dispatchTime) {
        console.log(`✓ Final dispatch time for product ${product.id}:`, dispatchTime);
      }

      return {
        id: product.id.toString(),
        name: product.name,
        slug: product.slug,
        price: parseFloat(product.price) || 0,
        originalPrice: product.regular_price ? parseFloat(product.regular_price) : undefined,
        discount: product.on_sale && product.regular_price
          ? Math.round(((parseFloat(product.regular_price) - parseFloat(product.price)) / parseFloat(product.regular_price)) * 100)
          : undefined,
        images: allImages,
        variationImages: variationImages.length > 0 ? variationImages : undefined,
        colors: product.attributes
          ?.find((attr: any) => attr.name.toLowerCase() === 'color' || attr.name.toLowerCase() === 'colour')
          ?.options || [],
        sizes: product.attributes
          ?.find((attr: any) => attr.name.toLowerCase() === 'size')
          ?.options || [],
        category: product.categories?.[0]?.name || 'Uncategorized',
        categorySlug: product.categories?.[0]?.slug || 'uncategorized',
        categoryId: product.categories?.[0]?.id?.toString() || '',
        isNew: product.featured,
        isSoldOut: product.stock_status === 'outofstock',
        description: product.description,
        shortDescription: product.short_description,
        inStock: product.stock_status === 'instock',
        stockQuantity: product.stock_quantity !== null && product.stock_quantity !== undefined
          ? parseInt(product.stock_quantity)
          : null,
        dispatchTime: dispatchTime,
        shippingPolicy: shippingPolicy,
        returnPolicy: returnPolicy,
        washCare: washCare,
        sku: product.sku,
        type: product.type,
        averageRating: product.average_rating,
        ratingCount: product.rating_count,
        variations: allVariationsData.length > 0 ? allVariationsData : undefined,
      };
    };

    // Handle single product vs multiple products
    let transformedProducts: any[];
    if (productId) {
      // Single product response (object, not array)
      if (skipVariations) {
        // Fast path for single product - basic variation images only (no gallery)
        let variationImages: { color: string; images: string[] }[] = [];
        let variations: any[] = [];

        if (responseData.type === 'variable') {
          try {
            const variationsUrl = `${storeUrl}/wp-json/wc/v3/products/${responseData.id}/variations?per_page=100`;
            const variationsResponse = await fetch(variationsUrl, {
              method: 'GET',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
              },
            });
            if (variationsResponse.ok) {
              variations = await variationsResponse.json();
              const colorImageMap: Record<string, string> = {};

              for (const variation of variations) {
                const colorAttr = variation.attributes?.find(
                  (attr: any) => attr.name?.toLowerCase() === 'color' || attr.name?.toLowerCase() === 'colour'
                );
                const colorName = colorAttr?.option?.trim() || 'Default';
                if (variation.image?.src && !colorImageMap[colorName]) {
                  colorImageMap[colorName] = variation.image.src;
                }
              }

              variationImages = Object.entries(colorImageMap).map(([color, imageUrl]) => ({
                color,
                images: [imageUrl],
              }));
            }
          } catch (err) {
            console.error(`Error fetching variations for ${responseData.id}:`, err);
          }
        }

        // Helper for extraction on single object (responseData)
        let dispatchTime: string | undefined = undefined;
        const extractRespField = (keys: string[]) => {
          if (responseData.meta_data && Array.isArray(responseData.meta_data) && responseData.meta_data.length > 0) {
            console.log(`Product ${responseData.id} meta keys:`, responseData.meta_data.map(m => m.key).join(', '));
          }
          if (responseData.acf && typeof responseData.acf === 'object') {
            for (const key of keys) {
              if (responseData.acf[key]) {
                const val = String(responseData.acf[key]).trim();
                if (val && val !== '0' && val.toLowerCase() !== 'false') return val;
              }
            }
          }
          if (responseData.meta_data && Array.isArray(responseData.meta_data)) {
            for (const meta of responseData.meta_data) {
              const normalizedMetaKey = (meta.key || '').toLowerCase().trim().replace(/^\_+/, '').replace(/\s+/g, '_');
              for (const key of keys) {
                const normalizedKey = key.toLowerCase().trim().replace(/^\_+/, '').replace(/\s+/g, '_');
                if (normalizedMetaKey === normalizedKey && meta.value) {
                  const val = String(meta.value).trim();
                  if (val && val !== '0' && val.toLowerCase() !== 'false') return val;
                }
              }
            }
          }
          if (responseData.attributes && Array.isArray(responseData.attributes)) {
            for (const attr of responseData.attributes) {
              const normalizedAttr = (attr.name || '').toLowerCase().trim().replace(/\s+/g, '_');
              for (const key of keys) {
                if (normalizedAttr.includes(key.toLowerCase()) && attr.options?.[0]) return String(attr.options[0]).trim();
              }
            }
          }
          return undefined;
        };

        dispatchTime = extractRespField(['dispatch_time', 'dispatchtime', 'shipping_time', 'delivery_time']);
        const shippingPolicy = extractRespField(['shipping_policy', 'shipping', 'shipping_info', 'delivery_info']);
        const returnPolicy = extractRespField(['return_policy', 'returns', 'return', 'return_info']);
        const washCare = extractRespField(['wash_care', 'washing_instructions', 'washcare', 'wash_instructions']);

        if (dispatchTime && !dispatchTime.toLowerCase().includes('day') && /^\d+$/.test(dispatchTime)) {
          dispatchTime = `${dispatchTime} days`;
        }

        transformedProducts = [{
          id: responseData.id.toString(),
          name: responseData.name,
          slug: responseData.slug,
          price: parseFloat(responseData.price) || 0,
          originalPrice: responseData.regular_price ? parseFloat(responseData.regular_price) : undefined,
          discount: responseData.on_sale && responseData.regular_price
            ? Math.round(((parseFloat(responseData.regular_price) - parseFloat(responseData.price)) / parseFloat(responseData.regular_price)) * 100)
            : undefined,
          images: responseData.images?.map((img: any) => img.src).filter(Boolean) || [],
          variationImages: variationImages.length > 0 ? variationImages : undefined,
          colors: responseData.attributes
            ?.find((attr: any) => attr.name.toLowerCase() === 'color' || attr.name.toLowerCase() === 'colour')
            ?.options || [],
          sizes: responseData.attributes
            ?.find((attr: any) => attr.name.toLowerCase() === 'size')
            ?.options || [],
          category: responseData.categories?.[0]?.name || 'Uncategorized',
          categorySlug: responseData.categories?.[0]?.slug || 'uncategorized',
          categoryId: responseData.categories?.[0]?.id?.toString() || '',
          isNew: responseData.featured,
          isSoldOut: responseData.stock_status === 'outofstock',
          description: responseData.description,
          shortDescription: responseData.short_description,
          inStock: responseData.stock_status === 'instock',
          stockQuantity: responseData.stock_quantity !== null && responseData.stock_quantity !== undefined
            ? parseInt(responseData.stock_quantity)
            : null,
          dispatchTime: dispatchTime,
          shippingPolicy: shippingPolicy,
          returnPolicy: returnPolicy,
          washCare: washCare,
          sku: responseData.sku,
          type: responseData.type,
          averageRating: responseData.average_rating,
          ratingCount: responseData.rating_count,
          variations: variations.map((v: any) => ({
            id: v.id,
            color: v.attributes?.find((a: any) => a.name?.toLowerCase() === 'color' || a.name?.toLowerCase() === 'colour')?.option?.trim() || 'Default',
            size: v.attributes?.find((a: any) => a.name?.toLowerCase() === 'size')?.option?.trim() || null,
            stockQuantity: v.stock_quantity !== null && v.stock_quantity !== undefined ? parseInt(v.stock_quantity) : null,
            stockStatus: v.stock_status || 'instock',
            manageStock: v.manage_stock || false,
          })),
        }];
        console.log(`Fetched product (fast path): ${responseData.name}`);
      } else {
        // Full processing with gallery images
        const transformed = await transformProduct(responseData);
        transformedProducts = [transformed];
        console.log(`Fetched product: ${responseData.name}`);
      }
    } else {
      // Multiple products response (array)
      if (skipVariations) {
        // Fast transformation with basic variation images (no gallery fetching)
        // The in-memory response cache (10s TTL) ensures these variation API calls only happen
        // once per 10 seconds — not per user. 100 users/sec = 999 cache hits, 1 actual fetch.
        const variableProducts = responseData.filter((p: any) => p.type === 'variable');
        const variationPromises = variableProducts.map(async (product: any) => {
          try {
            const variationsUrl = `${storeUrl}/wp-json/wc/v3/products/${product.id}/variations?per_page=100`;
            const variationsResponse = await fetch(variationsUrl, {
              method: 'GET',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
              },
            });
            if (variationsResponse.ok) {
              return { productId: product.id, variations: await variationsResponse.json() };
            }
          } catch (err) {
            console.error(`Error fetching variations for ${product.id}:`, err);
          }
          return { productId: product.id, variations: [] };
        });

        const variationsResults = await Promise.all(variationPromises);
        const variationsMap: Record<string, any[]> = {};
        variationsResults.forEach(result => {
          variationsMap[result.productId] = result.variations;
        });

        transformedProducts = responseData.map((product: any) => {
          // Build basic variation images from fetched variations (just main image per color, no gallery)
          let variationImages: { color: string; images: string[] }[] = [];

          if (product.type === 'variable' && variationsMap[product.id]) {
            const colorImageMap: Record<string, string> = {};

            for (const variation of variationsMap[product.id]) {
              const colorAttr = variation.attributes?.find(
                (attr: any) => attr.name?.toLowerCase() === 'color' || attr.name?.toLowerCase() === 'colour'
              );
              const colorName = colorAttr?.option?.trim() || 'Default';

              // Only use main variation image (skip gallery for speed)
              if (variation.image?.src && !colorImageMap[colorName]) {
                colorImageMap[colorName] = variation.image.src;
              }
            }

            // Convert map to array format
            variationImages = Object.entries(colorImageMap).map(([color, imageUrl]) => ({
              color,
              images: [imageUrl],
            }));
          }

          // Helper to extract fields from ACF and meta_data
          let dispatchTime: string | undefined = undefined;
          const extractField = (keys: string[]) => {
            if (product.acf && typeof product.acf === 'object') {
              for (const key of keys) {
                if (product.acf[key]) {
                  const val = String(product.acf[key]).trim();
                  if (val && val !== '0' && val.toLowerCase() !== 'false') return val;
                }
              }
            }
            if (product.meta_data && Array.isArray(product.meta_data)) {
              for (const meta of product.meta_data) {
                const normalizedMetaKey = (meta.key || '').toLowerCase().trim().replace(/^\_+/, '').replace(/\s+/g, '_');
                for (const key of keys) {
                  const normalizedKey = key.toLowerCase().trim().replace(/^\_+/, '').replace(/\s+/g, '_');
                  if (normalizedMetaKey === normalizedKey && meta.value) {
                    const val = String(meta.value).trim();
                    if (val && val !== '0' && val.toLowerCase() !== 'false') return val;
                  }
                }
              }
            }
            if (product.attributes && Array.isArray(product.attributes)) {
              for (const attr of product.attributes) {
                const normalizedAttr = (attr.name || '').toLowerCase().trim().replace(/\s+/g, '_');
                for (const key of keys) {
                  if (normalizedAttr.includes(key.toLowerCase()) && attr.options?.[0]) return String(attr.options[0]).trim();
                }
              }
            }
            return undefined;
          };

          dispatchTime = extractField(['dispatch_time', 'dispatchtime', 'shipping_time', 'delivery_time']);
          const shippingPolicy = extractField(['shipping_policy', 'shipping', 'shipping_info', 'delivery_info']);
          const returnPolicy = extractField(['return_policy', 'returns', 'return', 'return_info']);
          const washCare = extractField(['wash_care', 'washing_instructions', 'washcare', 'wash_instructions']);

          if (dispatchTime && !dispatchTime.toLowerCase().includes('day') && /^\d+$/.test(dispatchTime)) {
            dispatchTime = `${dispatchTime} days`;
          }

          return {
            id: product.id.toString(),
            name: product.name,
            slug: product.slug,
            price: parseFloat(product.price) || 0,
            originalPrice: product.regular_price ? parseFloat(product.regular_price) : undefined,
            discount: product.on_sale && product.regular_price
              ? Math.round(((parseFloat(product.regular_price) - parseFloat(product.price)) / parseFloat(product.regular_price)) * 100)
              : undefined,
            images: product.images?.map((img: any) => img.src).filter(Boolean) || [],
            variationImages: variationImages.length > 0 ? variationImages : undefined,
            colors: product.attributes
              ?.find((attr: any) => attr.name.toLowerCase() === 'color' || attr.name.toLowerCase() === 'colour')
              ?.options || [],
            sizes: product.attributes
              ?.find((attr: any) => attr.name.toLowerCase() === 'size')
              ?.options || [],
            category: product.categories?.[0]?.name || 'Uncategorized',
            categorySlug: product.categories?.[0]?.slug || 'uncategorized',
            categoryId: product.categories?.[0]?.id?.toString() || '',
            isNew: product.featured,
            isSoldOut: product.stock_status === 'outofstock',
            description: product.description,
            shortDescription: product.short_description,
            inStock: product.stock_status === 'instock',
            stockQuantity: product.stock_quantity !== null && product.stock_quantity !== undefined
              ? parseInt(product.stock_quantity)
              : null,
            dispatchTime: dispatchTime,
            shippingPolicy: shippingPolicy,
            returnPolicy: returnPolicy,
            washCare: washCare,
            sku: product.sku,
            type: product.type,
            averageRating: product.average_rating,
            ratingCount: product.rating_count,
            variations: (variationsMap[product.id] || []).map((v: any) => ({
              id: v.id,
              color: v.attributes?.find((a: any) => a.name?.toLowerCase() === 'color' || a.name?.toLowerCase() === 'colour')?.option?.trim() || 'Default',
              size: v.attributes?.find((a: any) => a.name?.toLowerCase() === 'size')?.option?.trim() || null,
              stockQuantity: v.stock_quantity !== null && v.stock_quantity !== undefined ? parseInt(v.stock_quantity) : null,
              stockStatus: v.stock_status || 'instock',
              manageStock: v.manage_stock || false,
            })),
          };
        });
        console.log(`Fetched ${responseData.length} products (fast path with variation images, cached for ${LIST_CACHE_TTL/1000}s)`);
      } else {
        // Full processing with variations
        transformedProducts = await Promise.all(responseData.map(transformProduct));
        console.log(`Fetched ${responseData.length} products`);
      }
    }

    const responseBody = JSON.stringify({
      products: transformedProducts,
      total: productId ? 1 : parseInt(totalProducts || '0'),
      totalPages: productId ? 1 : parseInt(totalPages || '1'),
      currentPage: parseInt(page),
    });

    // L1: Store in in-memory cache for subsequent requests within the same isolate
    responseCache.set(cacheKey, { data: responseBody, timestamp: Date.now() });

    // L2: Store in DB cache for cross-isolate sharing (fire-and-forget)
    if (supabase) {
      supabase.from('product_cache')
        .upsert({ cache_key: cacheKey, response_data: JSON.parse(responseBody), cached_at: new Date().toISOString() })
        .then(({ error }: { error: any }) => { if (error) console.error('L2 cache write failed:', error); })
        .catch((err: any) => console.error('L2 cache write error:', err));

      // Periodic cleanup: ~1% chance per request, delete entries older than 60s
      if (Math.random() < 0.01) {
        supabase.from('product_cache')
          .delete()
          .lt('cached_at', new Date(Date.now() - 60_000).toISOString())
          .then(({ error }: { error: any }) => { if (error) console.error('Cache cleanup failed:', error); })
          .catch((err: any) => console.error('Cache cleanup error:', err));
      }
    }

    return new Response(responseBody, {
      headers: { ...cacheHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in woocommerce-products function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
