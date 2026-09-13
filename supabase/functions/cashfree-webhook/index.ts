import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/* ======================================================================
 * Shared helpers — inlined so this file deploys from the Dashboard editor
 * with no extra files. Source of truth: supabase/functions/_shared/
 *   whatsapp.ts  — Meta WhatsApp Cloud API (order confirmation template)
 *   cashfree.ts  — Cashfree PG client + WooCommerce "mark paid"
 * ====================================================================== */

interface TemplateButton {
  subType: 'url' | 'quick_reply' | 'copy_code';
  index: number;
  parameters: string[];
}

interface SendTemplateArgs {
  to: string;
  template: string;
  languageCode?: string;
  headerValues?: string[];
  bodyValues?: string[];
  buttons?: TemplateButton[];
}

interface SendResult {
  ok: boolean;
  status: number;
  messageId?: string;
  error?: string;
  raw: unknown;
}

/**
 * Normalise a number to the E.164 digits Meta expects.
 * "+91 98765 43210", "09876543210", "919876543210" -> "919876543210"
 * A bare 10-digit number gets the default country code prepended.
 */
function toWhatsAppNumber(phone: string, defaultCountry = '91'): string {
  let digits = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) digits = defaultCountry + digits;
  return digits;
}

/** Strip a number down to the local 10-digit form used as the DB key. */
function toLocalNumber(phone: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function textParams(values: string[]) {
  return values.map((v) => ({ type: 'text', text: String(v ?? '') }));
}

async function sendTemplate(args: SendTemplateArgs): Promise<SendResult> {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const version = Deno.env.get('WHATSAPP_API_VERSION') || 'v21.0';

  if (!token || !phoneNumberId) {
    console.error('[whatsapp] missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return {
      ok: false,
      status: 500,
      error: 'WhatsApp Cloud API is not configured',
      raw: null,
    };
  }

  const components: Record<string, unknown>[] = [];

  if (args.headerValues?.length) {
    components.push({ type: 'header', parameters: textParams(args.headerValues) });
  }
  if (args.bodyValues?.length) {
    components.push({ type: 'body', parameters: textParams(args.bodyValues) });
  }
  for (const button of args.buttons ?? []) {
    components.push({
      type: 'button',
      sub_type: button.subType,
      index: String(button.index),
      parameters:
        button.subType === 'copy_code'
          ? button.parameters.map((v) => ({ type: 'coupon_code', coupon_code: String(v) }))
          : textParams(button.parameters),
    });
  }

  const to = toWhatsAppNumber(args.to);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: args.template,
      language: { code: args.languageCode || 'en' },
      ...(components.length ? { components } : {}),
    },
  };

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  console.log(`[whatsapp] -> ${args.template} to ${to}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { message: raw };
  }

  if (!response.ok) {
    // Meta buries the useful part under error.error_data.details
    const metaError =
      parsed?.error?.error_data?.details || parsed?.error?.message || raw;
    console.error(`[whatsapp] ${args.template} failed ${response.status}: ${metaError}`);
    return { ok: false, status: response.status, error: metaError, raw: parsed };
  }

  const messageId = parsed?.messages?.[0]?.id;
  console.log(`[whatsapp] ${args.template} sent id=${messageId}`);
  return { ok: true, status: 200, messageId, raw: parsed };
}

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

const CASHFREE_API_VERSION = "2023-08-01";

const cashfreeMode = (): "sandbox" | "production" =>
  (Deno.env.get("CASHFREE_ENV") || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";

const cashfreeBase = () =>
  cashfreeMode() === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com";

const cashfreeHeaders = () => {
  const appId = Deno.env.get("CASHFREE_APP_ID");
  const secret = Deno.env.get("CASHFREE_SECRET_KEY");
  if (!appId || !secret) throw new Error("Cashfree credentials not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY)");
  return {
    "x-client-id": appId,
    "x-client-secret": secret,
    "x-api-version": CASHFREE_API_VERSION,
    "Content-Type": "application/json",
  };
};

/** Our Cashfree order ids embed the WooCommerce order id: KL_<wooId>_<timestamp>. */
const makeCashfreeOrderId = (wooOrderId: number | string) => `KL_${wooOrderId}_${Date.now()}`;
const wooOrderIdFromCashfreeOrderId = (cfOrderId: string): string | null => {
  const m = /^KL_(\d+)_\d+$/.exec(cfOrderId || "");
  return m ? m[1] : null;
};

interface CashfreeOrder {
  cf_order_id?: string;
  order_id: string;
  order_status: string; // ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED
  order_amount: number;
  order_currency: string;
  payment_session_id?: string;
}

interface CashfreePayment {
  cf_payment_id: string | number;
  payment_status: string; // SUCCESS | FAILED | PENDING | USER_DROPPED | ...
  payment_amount: number;
  payment_group?: string; // upi | credit_card | net_banking | ...
  payment_method?: unknown;
  payment_time?: string;
}

const getCashfreeOrder = async (orderId: string): Promise<CashfreeOrder> => {
  const res = await fetch(`${cashfreeBase()}/pg/orders/${encodeURIComponent(orderId)}`, { headers: cashfreeHeaders() });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message || `Cashfree order lookup failed (${res.status})`);
  return body as CashfreeOrder;
};

const getCashfreePayments = async (orderId: string): Promise<CashfreePayment[]> => {
  const res = await fetch(`${cashfreeBase()}/pg/orders/${encodeURIComponent(orderId)}/payments`, { headers: cashfreeHeaders() });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message || `Cashfree payments lookup failed (${res.status})`);
  return Array.isArray(body) ? (body as CashfreePayment[]) : [];
};

/** Webhook signature = base64( HMAC-SHA256( timestamp + rawBody, secret ) ). */
const verifyWebhookSignature = async (timestamp: string, rawBody: string, signature: string): Promise<boolean> => {
  const secret = Deno.env.get("CASHFREE_SECRET_KEY");
  if (!secret || !timestamp || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === signature;
};

/* ------------------------------------------------------------------ */
/* WooCommerce                                                          */
/* ------------------------------------------------------------------ */

const wooConfig = () => {
  const storeUrlRaw = Deno.env.get("WOOCOMMERCE_STORE_URL");
  const consumerKey = Deno.env.get("WOOCOMMERCE_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("WOOCOMMERCE_CONSUMER_SECRET");
  if (!storeUrlRaw || !consumerKey || !consumerSecret) throw new Error("WooCommerce credentials missing");
  return {
    storeUrl: storeUrlRaw.replace(/\/+$/, ""),
    auth: "Basic " + btoa(`${consumerKey}:${consumerSecret}`),
  };
};

const getWooOrder = async (wooOrderId: string | number) => {
  const { storeUrl, auth } = wooConfig();
  const res = await fetch(`${storeUrl}/wp-json/wc/v3/orders/${wooOrderId}`, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`WooCommerce order ${wooOrderId} lookup failed (${res.status})`);
  return res.json();
};

const updateWooOrder = async (wooOrderId: string | number, body: Record<string, unknown>) => {
  const { storeUrl, auth } = wooConfig();
  const res = await fetch(`${storeUrl}/wp-json/wc/v3/orders/${wooOrderId}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WooCommerce order update failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

/**
 * Mark a WooCommerce order paid after a successful Cashfree payment, then
 * send the WhatsApp confirmation. Idempotent: an order that's already
 * processing/completed (the webhook and the browser both call this) is
 * returned untouched.
 */
const markWooOrderPaid = async (
  wooOrderId: string | number,
  cfOrder: CashfreeOrder,
  payment: CashfreePayment | undefined,
): Promise<{ updated: boolean; alreadyPaid: boolean; order: any }> => {
  const existing = await getWooOrder(wooOrderId);
  if (["processing", "completed"].includes(existing.status)) {
    console.log(`Order ${wooOrderId} already ${existing.status} — skipping update`);
    return { updated: false, alreadyPaid: true, order: existing };
  }

  const paymentId = payment ? String(payment.cf_payment_id) : "";
  const order = await updateWooOrder(wooOrderId, {
    status: "processing",
    set_paid: true,
    transaction_id: paymentId || cfOrder.order_id,
    meta_data: [
      { key: "_cashfree_order_id", value: cfOrder.order_id },
      { key: "_cashfree_cf_order_id", value: cfOrder.cf_order_id || "" },
      { key: "_cashfree_payment_id", value: paymentId },
      { key: "_cashfree_payment_group", value: payment?.payment_group || "" },
      { key: "_cashfree_order_status", value: cfOrder.order_status },
    ],
  });
  console.log("Order updated to processing:", order.id);

  await sendWhatsAppConfirmation(order);
  return { updated: true, alreadyPaid: false, order };
};

/** Same WhatsApp (Meta) order confirmation the Razorpay flow sends; failures are logged, never thrown. */
const sendWhatsAppConfirmation = async (order: any) => {
  try {
    const whatsappMeta = order.meta_data?.find((m: any) => m.key === "whatsapp_number")?.value;
    const whatsappNumber = whatsappMeta || order.billing?.phone;
    if (!whatsappNumber) return;

    const orderNo = String(order.number || order.id);
    const result = await sendTemplate({
      to: whatsappNumber,
      template: "order_cnf_as",
      languageCode: "en",
      // {{1}} name  {{2}} order id  {{3}} currency  {{4}} amount
      bodyValues: [order.billing?.first_name || "Customer", orderNo, "₹", String(order.total ?? "0")],
      buttons: [{ subType: "url", index: 0, parameters: [orderNo] }],
    });
    console.log("WhatsApp confirmation:", result.ok ? `sent ${result.messageId}` : `failed ${result.error}`);
  } catch (err) {
    console.error("Error sending WhatsApp notification:", err);
  }
};

/* ====================================================================== */

/**
 * Cashfree → us. Backstop for the browser flow: if the shopper's tab dies
 * after paying, this still marks the WooCommerce order paid.
 *
 * Register in Cashfree dashboard → Developers → Webhooks (Payment Gateway):
 *   https://<project>.supabase.co/functions/v1/cashfree-webhook
 * Verify JWT must be OFF for this function — Cashfree can't send a Supabase token.
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";
  const timestamp = req.headers.get("x-webhook-timestamp") || "";

  if (!(await verifyWebhookSignature(timestamp, rawBody, signature))) {
    console.warn("Cashfree webhook signature mismatch");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const type = event?.type;
  const orderId: string | undefined = event?.data?.order?.order_id;
  console.log("Cashfree webhook:", type, orderId);

  // Only successful payments change anything; acknowledge everything else so Cashfree stops retrying.
  if (type !== "PAYMENT_SUCCESS_WEBHOOK" || !orderId) {
    return new Response("ignored", { status: 200 });
  }

  const wooOrderId = event?.data?.order?.order_tags?.woocommerce_order_id || wooOrderIdFromCashfreeOrderId(orderId);
  if (!wooOrderId) {
    console.error("Webhook order has no WooCommerce id:", orderId);
    return new Response("no woo order", { status: 200 });
  }

  try {
    // Re-fetch from Cashfree rather than trusting the payload's amounts.
    const cfOrder = await getCashfreeOrder(orderId);
    if (cfOrder.order_status !== "PAID") {
      console.warn("Webhook says success but order is", cfOrder.order_status);
      return new Response("not paid", { status: 200 });
    }
    const payments = await getCashfreePayments(orderId);
    const success = payments.find((p) => p.payment_status === "SUCCESS");
    const result = await markWooOrderPaid(wooOrderId, cfOrder, success);
    console.log("Webhook processed:", wooOrderId, result.alreadyPaid ? "already paid" : "updated");
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("cashfree-webhook error:", error);
    // 500 makes Cashfree retry later, which is what we want if WooCommerce was briefly down.
    return new Response("error", { status: 500 });
  }
});
