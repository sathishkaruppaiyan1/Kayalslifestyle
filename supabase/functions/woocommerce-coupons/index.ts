import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Checks a WooCommerce coupon against the shopper's cart and previews the
// discount. WooCommerce stays the authority: the order is created with
// coupon_lines and WooCommerce applies (or rejects) the coupon itself. This
// preview only has to be close enough to show the right total up front.
//
// POST { code, email?, items: [{ product_id, variation_id?, quantity, price }] }
// 200  { valid: true, code, discount, discount_type, amount }
// 200  { valid: false, error }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const invalid = (error: string) => json({ valid: false, error });

interface CartItem {
  product_id: number;
  variation_id?: number;
  quantity: number;
  price: number;
}

const money = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** WooCommerce email restrictions allow "*" wildcards, e.g. *@example.com */
const emailMatches = (email: string, patterns: string[]) =>
  patterns.some((p) => {
    const re = new RegExp(
      "^" + p.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    return re.test(email.toLowerCase());
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const storeUrlRaw = Deno.env.get("WOOCOMMERCE_STORE_URL");
    const consumerKey = Deno.env.get("WOOCOMMERCE_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("WOOCOMMERCE_CONSUMER_SECRET");
    if (!storeUrlRaw || !consumerKey || !consumerSecret) {
      console.error("Missing WooCommerce credentials");
      return json({ error: "WooCommerce credentials not configured" }, 500);
    }
    const storeUrl = storeUrlRaw.replace(/\/+$/, "");
    const wooGet = async (path: string) => {
      const res = await fetch(`${storeUrl}/wp-json/wc/v3/${path}`, {
        headers: { Authorization: "Basic " + btoa(`${consumerKey}:${consumerSecret}`) },
      });
      if (!res.ok) throw new Error(`WooCommerce ${path.split("?")[0]} ${res.status}: ${await res.text()}`);
      return res.json();
    };

    const body = await req.json();
    const code = String(body?.code ?? "").trim().toLowerCase();
    const email = String(body?.email ?? "").trim();
    const items: CartItem[] = (Array.isArray(body?.items) ? body.items : [])
      .map((i: any) => ({
        product_id: Number(i.product_id),
        variation_id: i.variation_id ? Number(i.variation_id) : undefined,
        quantity: Number(i.quantity) || 0,
        price: Number(i.price) || 0,
      }))
      .filter((i: CartItem) => i.product_id && i.quantity > 0);

    if (!code) return invalid("Please enter a coupon code.");
    if (!items.length) return invalid("Your cart is empty.");

    const matches = await wooGet(`coupons?code=${encodeURIComponent(code)}`);
    const coupon = (matches as any[]).find((c) => String(c.code).toLowerCase() === code);
    if (!coupon || coupon.status !== "publish") return invalid("This coupon code is not valid.");

    if (coupon.date_expires_gmt && new Date(coupon.date_expires_gmt + "Z") < new Date()) {
      return invalid("This coupon has expired.");
    }
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return invalid("This coupon has already been fully used.");
    }
    if (email && coupon.usage_limit_per_user) {
      const uses = (coupon.used_by ?? []).filter(
        (u: string) => String(u).toLowerCase() === email.toLowerCase(),
      ).length;
      if (uses >= coupon.usage_limit_per_user) {
        return invalid("You have already used this coupon.");
      }
    }
    if (email && coupon.email_restrictions?.length && !emailMatches(email, coupon.email_restrictions)) {
      return invalid("This coupon is not valid for your email address.");
    }

    // Minimum/maximum spend is checked against the whole cart, as WooCommerce does.
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const min = Number(coupon.minimum_amount) || 0;
    const max = Number(coupon.maximum_amount) || 0;
    if (min && subtotal < min) {
      return invalid(`Add ${money(round2(min - subtotal))} more to use this coupon (minimum order ${money(min)}).`);
    }
    if (max && subtotal > max) {
      return invalid(`This coupon is only valid for orders up to ${money(max)}.`);
    }

    // Category and sale restrictions need the parent products.
    const includeCats: number[] = coupon.product_categories ?? [];
    const excludeCats: number[] = coupon.excluded_product_categories ?? [];
    const products = new Map<number, { cats: number[]; onSale: boolean }>();
    if (includeCats.length || excludeCats.length || coupon.exclude_sale_items) {
      const ids = [...new Set(items.map((i) => i.product_id))];
      const list = await wooGet(`products?include=${ids.join(",")}&per_page=100`);
      for (const p of list as any[]) {
        products.set(p.id, {
          cats: (p.categories ?? []).map((c: any) => c.id),
          onSale: Boolean(p.on_sale),
        });
      }
    }

    const includeIds: number[] = coupon.product_ids ?? [];
    const excludeIds: number[] = coupon.excluded_product_ids ?? [];
    const eligible = items.filter((i) => {
      const ids = [i.product_id, i.variation_id].filter(Boolean) as number[];
      const p = products.get(i.product_id);
      if (includeIds.length && !ids.some((id) => includeIds.includes(id))) return false;
      if (ids.some((id) => excludeIds.includes(id))) return false;
      if (includeCats.length && !p?.cats.some((c) => includeCats.includes(c))) return false;
      if (excludeCats.length && p?.cats.some((c) => excludeCats.includes(c))) return false;
      if (coupon.exclude_sale_items && p?.onSale) return false;
      return true;
    });
    if (!eligible.length) return invalid("This coupon does not apply to the items in your cart.");

    const amount = Number(coupon.amount) || 0;
    const eligibleSubtotal = eligible.reduce((s, i) => s + i.price * i.quantity, 0);
    let discount = 0;
    if (coupon.discount_type === "percent") {
      discount = (eligibleSubtotal * amount) / 100;
    } else if (coupon.discount_type === "fixed_product") {
      let unitsLeft = coupon.limit_usage_to_x_items || Infinity;
      for (const i of eligible) {
        const units = Math.min(i.quantity, unitsLeft);
        unitsLeft -= units;
        discount += Math.min(amount, i.price) * units;
      }
    } else {
      // fixed_cart
      discount = Math.min(amount, eligibleSubtotal);
    }
    discount = round2(Math.min(discount, subtotal));

    if (discount <= 0) return invalid("This coupon does not give a discount on your cart.");

    return json({
      valid: true,
      code: coupon.code,
      discount,
      discount_type: coupon.discount_type,
      amount,
    });
  } catch (error) {
    console.error("Error in woocommerce-coupons:", error);
    return json({ error: "Could not check the coupon right now. Please try again." }, 500);
  }
});
