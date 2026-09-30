import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/* ======================================================================
 * Shared helpers — inlined so this file deploys from the Dashboard editor
 * with no extra files. Source of truth: supabase/functions/_shared/
 *   whatsapp.ts  — WATI WhatsApp API (order confirmation template)
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
 * Normalise a number to the E.164 digits WhatsApp expects.
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

// WATI names template variables ({{name}}, {{order_id}}, or {{1}} for
// Meta-imported templates), so positional bodyValues are mapped onto the
// template's own parameter names. Looked up once per function instance.
const watiParamNames = new Map<string, string[]>();

async function templateParamNames(
  endpoint: string,
  token: string,
  template: string,
): Promise<string[] | null> {
  const cached = watiParamNames.get(template);
  if (cached) return cached;
  try {
    const res = await fetch(`${endpoint}/api/v1/getMessageTemplates?pageSize=200`, {
      headers: { Authorization: token },
    });
    const data = await res.json();
    const match = (data?.messageTemplates ?? []).find(
      (t: Record<string, any>) => t.elementName === template && t.status !== 'DELETED',
    );
    if (!match) return null;
    const names = (match.customParams ?? []).map((p: Record<string, any>) => String(p.paramName));
    watiParamNames.set(template, names);
    return names;
  } catch (err) {
    console.error(`[whatsapp] could not read WATI template ${template}:`, err);
    return null;
  }
}

/**
 * Send an approved template through WATI.
 * Only body variables are sent: WATI fills button URLs and the OTP copy-code
 * button from the template itself, so `buttons` and `headerValues` are ignored.
 */
async function sendTemplate(args: SendTemplateArgs): Promise<SendResult> {
  const endpoint = (Deno.env.get('WATI_API_ENDPOINT') || '').replace(/\/+$/, '');
  const rawToken = (Deno.env.get('WATI_ACCESS_TOKEN') || '').trim();

  if (!endpoint || !rawToken) {
    console.error('[whatsapp] missing WATI_API_ENDPOINT or WATI_ACCESS_TOKEN');
    return { ok: false, status: 500, error: 'WATI is not configured', raw: null };
  }
  const token = rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`;

  const values = (args.bodyValues ?? []).map((v) => String(v ?? ''));
  const names = values.length ? await templateParamNames(endpoint, token, args.template) : [];
  if (names === null) {
    const error = `WATI template "${args.template}" not found or not approved`;
    console.error(`[whatsapp] ${error}`);
    return { ok: false, status: 400, error, raw: null };
  }
  const parameters = values.map((value, i) => ({ name: names[i] ?? String(i + 1), value }));

  const to = toWhatsAppNumber(args.to);
  const url = `${endpoint}/api/v1/sendTemplateMessage?whatsappNumber=${to}`;
  console.log(`[whatsapp] -> ${args.template} to ${to}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_name: args.template,
      broadcast_name: args.template,
      parameters,
    }),
  });

  const raw = await response.text();
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { message: raw };
  }

  // WATI answers 200 with result:false for bad templates or non-WhatsApp numbers.
  if (!response.ok || parsed?.result === false || parsed?.validWhatsAppNumber === false) {
    // Validation errors come back as 400 {items: [{code, description}]}.
    const watiError =
      parsed?.items?.map((i: Record<string, any>) => i.description).join('; ') ||
      parsed?.info || parsed?.message ||
      (parsed?.validWhatsAppNumber === false ? 'Number is not on WhatsApp' : raw);
    const status = response.ok ? 400 : response.status;
    console.error(`[whatsapp] ${args.template} failed ${status}: ${watiError}`);
    return { ok: false, status, error: String(watiError), raw: parsed };
  }

  const messageId = parsed?.model?.ids?.[0] ?? parsed?.id;
  console.log(`[whatsapp] ${args.template} sent id=${messageId ?? '?'}`);
  return { ok: true, status: 200, messageId, raw: parsed };
}

/* ----------------------------------------------------------------------
 * payment_logs writer. Source of truth: supabase/functions/_shared/paymentLog.ts
 *
 * Every gateway interaction leaves a row, so "the customer paid but the order
 * says cancelled" is answerable after the fact. Logging never throws and
 * never blocks a payment: a broken log table must not cost someone an order.
 * `raw` is whitelisted before storage so card/VPA details never land in the DB.
 * -------------------------------------------------------------------- */

type PaymentLogEvent =
  | "order_created"
  | "checkout_returned"
  | "verify"
  | "webhook"
  | "marked_paid"
  | "already_paid"
  | "left_pending"
  | "marked_failed"
  | "reconciled"
  | "error";

interface PaymentLogRow {
  gateway: "cashfree" | "razorpay";
  source: string;
  event: PaymentLogEvent;
  woo_order_id?: number | string | null;
  gateway_order_id?: string | null;
  gateway_payment_id?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  gateway_status?: string | null;
  payment_status?: string | null;
  woo_status_before?: string | null;
  woo_status_after?: string | null;
  ok?: boolean | null;
  message?: string | null;
  raw?: unknown;
}

const RAW_ALLOWED = new Set([
  "order_id", "cf_order_id", "order_status", "order_amount", "order_currency",
  "cf_payment_id", "payment_status", "payment_amount", "payment_group",
  "payment_time", "payment_message", "bank_reference", "type", "event_time",
  "razorpay_order_id", "razorpay_payment_id", "status", "method", "amount",
  "currency", "error_code", "error_description",
]);

const scrubRaw = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return null;
  if (depth > 3) return "[deep]";
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => scrubRaw(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!RAW_ALLOWED.has(k)) continue;
      out[k] = typeof v === "object" ? scrubRaw(v, depth + 1) : v;
    }
    return out;
  }
  if (typeof value === "string") return value.slice(0, 500);
  return value;
};

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const logPayment = async (row: PaymentLogRow): Promise<void> => {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
    if (!url || !key) {
      console.warn("[payment_log] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing - not logging");
      return;
    }
    const res = await fetch(`${url}/rest/v1/payment_logs`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        gateway: row.gateway,
        source: row.source,
        event: row.event,
        woo_order_id: numOrNull(row.woo_order_id),
        gateway_order_id: row.gateway_order_id ?? null,
        gateway_payment_id: row.gateway_payment_id ?? null,
        amount: numOrNull(row.amount),
        currency: row.currency ?? "INR",
        gateway_status: row.gateway_status ?? null,
        payment_status: row.payment_status ?? null,
        woo_status_before: row.woo_status_before ?? null,
        woo_status_after: row.woo_status_after ?? null,
        ok: row.ok ?? null,
        message: row.message ? String(row.message).slice(0, 2000) : null,
        raw: row.raw === undefined ? null : scrubRaw(row.raw),
      }),
    });
    if (!res.ok) {
      console.warn(`[payment_log] insert failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  } catch (err) {
    console.warn("[payment_log] insert threw:", err);
  }
};

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

const SOURCE = "create-cashfree-order";

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

/** Same WhatsApp (WATI) order confirmation the Razorpay flow sends; failures are logged, never thrown. */
const sendWhatsAppConfirmation = async (order: any) => {
  try {
    const whatsappMeta = order.meta_data?.find((m: any) => m.key === "whatsapp_number")?.value;
    const whatsappNumber = whatsappMeta || order.billing?.phone;
    if (!whatsappNumber) return;

    const orderNo = String(order.number || order.id);
    const result = await sendTemplate({
      to: whatsappNumber,
      template: Deno.env.get("WATI_ORDER_TEMPLATE") || "kayals_order_confirmation",
      // name, order id, amount — in the order they appear in the template
      bodyValues: [order.billing?.first_name || "Customer", orderNo, String(order.total ?? "0")],
    });
    console.log("WhatsApp confirmation:", result.ok ? `sent ${result.messageId}` : `failed ${result.error}`);
  } catch (err) {
    console.error("Error sending WhatsApp notification:", err);
  }
};

/* ====================================================================== */

/**
 * Step 1 of a Cashfree payment. The storefront has already created the
 * WooCommerce order (status: pending); this creates the matching Cashfree
 * order and returns the payment_session_id the Cashfree JS SDK needs.
 *
 * POST { woocommerce_order_id, amount, customer: { name, email, phone }, return_url? }
 *  -> { order_id, payment_session_id, mode }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { woocommerce_order_id, amount, customer, return_url, order_note } = await req.json();

    if (!woocommerce_order_id || !amount || !customer?.phone) {
      return json({ error: "woocommerce_order_id, amount and customer.phone are required" }, 400);
    }

    // Cashfree wants a bare 10-digit Indian number and an alphanumeric customer id.
    const phone = String(customer.phone).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").slice(-10);
    if (phone.length !== 10) {
      return json({ error: "A valid 10-digit phone number is required" }, 400);
    }

    const orderId = makeCashfreeOrderId(woocommerce_order_id);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const notifyUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/cashfree-webhook` : undefined;

    const payload = {
      order_id: orderId,
      order_amount: Number(Number(amount).toFixed(2)),
      order_currency: "INR",
      order_note: order_note || `Order ${woocommerce_order_id}`,
      customer_details: {
        customer_id: `wc_${phone}`,
        customer_name: String(customer.name || "Customer").slice(0, 100),
        customer_email: customer.email || undefined,
        customer_phone: phone,
      },
      order_meta: {
        return_url: return_url || undefined,
        notify_url: notifyUrl,
      },
      order_tags: { woocommerce_order_id: String(woocommerce_order_id) },
    };

    console.log("Creating Cashfree order:", orderId, "amount:", payload.order_amount);

    const res = await fetch(`${cashfreeBase()}/pg/orders`, {
      method: "POST",
      headers: cashfreeHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    if (!res.ok || !body?.payment_session_id) {
      console.error("Cashfree order creation failed:", res.status, JSON.stringify(body).slice(0, 500));
      await logPayment({
        gateway: "cashfree",
        source: SOURCE,
        event: "error",
        woo_order_id: woocommerce_order_id,
        gateway_order_id: orderId,
        amount: payload.order_amount,
        ok: false,
        message: `Cashfree order creation failed (${res.status}): ${body?.message || "no payment_session_id"}`,
        raw: body,
      });
      return json({ error: body?.message || "Could not start Cashfree payment" }, 502);
    }

    // One row per payment attempt starts here, so a WooCommerce order that
    // never reaches a paid state can still be traced back to its gateway order.
    await logPayment({
      gateway: "cashfree",
      source: SOURCE,
      event: "order_created",
      woo_order_id: woocommerce_order_id,
      gateway_order_id: orderId,
      amount: payload.order_amount,
      currency: "INR",
      gateway_status: body?.order_status ?? "ACTIVE",
      ok: true,
      message: `Cashfree order opened in ${cashfreeMode()} mode`,
      raw: body,
    });

    // Remember the Cashfree ids on the WooCommerce order for reconciliation.
    try {
      await updateWooOrder(woocommerce_order_id, {
        meta_data: [
          { key: "_cashfree_order_id", value: orderId },
          { key: "_cashfree_cf_order_id", value: body.cf_order_id || "" },
        ],
      });
    } catch (err) {
      console.warn("Could not store Cashfree ids on WooCommerce order:", err);
    }

    return json({
      order_id: orderId,
      cf_order_id: body.cf_order_id,
      payment_session_id: body.payment_session_id,
      mode: cashfreeMode(),
    });
  } catch (error) {
    console.error("create-cashfree-order error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
