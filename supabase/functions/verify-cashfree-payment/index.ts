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

const SOURCE = "verify-cashfree-payment";

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
    await logPayment({
      gateway: "cashfree",
      source: SOURCE,
      event: "already_paid",
      woo_order_id: wooOrderId,
      gateway_order_id: cfOrder.order_id,
      gateway_status: cfOrder.order_status,
      woo_status_before: existing.status,
      woo_status_after: existing.status,
      ok: true,
      message: `Already ${existing.status}; nothing to do`,
    });
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
  await logPayment({
    gateway: "cashfree",
    source: SOURCE,
    event: "marked_paid",
    woo_order_id: wooOrderId,
    gateway_order_id: cfOrder.order_id,
    gateway_payment_id: paymentId || null,
    amount: cfOrder.order_amount,
    currency: cfOrder.order_currency,
    gateway_status: cfOrder.order_status,
    payment_status: payment?.payment_status ?? null,
    woo_status_before: existing.status,
    woo_status_after: "processing",
    ok: true,
    // Worth recording loudly: this is the path that repairs an order the
    // old cancel-on-ACTIVE behaviour had already written off.
    message: ["cancelled", "failed"].includes(existing.status)
      ? `Recovered an order that was wrongly ${existing.status}`
      : "Marked paid",
    raw: { order: cfOrder, payment },
  });

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
 * Step 2 — called by the storefront when the Cashfree checkout closes. Never
 * trusts the browser: asks Cashfree for the order status and only marks the
 * WooCommerce order paid when Cashfree says PAID.
 *
 * POST { order_id, woocommerce_order_id }
 *  -> { payment_success, order_status, updated, already_paid }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let loggedOrderId: string | undefined;
  let loggedWooId: string | number | undefined;

  try {
    const { order_id, woocommerce_order_id } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);
    loggedOrderId = order_id;

    const wooOrderId = woocommerce_order_id || wooOrderIdFromCashfreeOrderId(order_id);
    if (!wooOrderId) return json({ error: "woocommerce_order_id is required" }, 400);
    loggedWooId = wooOrderId;

    const cfOrder = await getCashfreeOrder(order_id);
    const payments = await getCashfreePayments(order_id);
    console.log("Cashfree order", order_id, "status:", cfOrder.order_status, "payments:", payments.length);

    await logPayment({
      gateway: "cashfree",
      source: SOURCE,
      event: "verify",
      woo_order_id: wooOrderId,
      gateway_order_id: cfOrder.order_id,
      amount: cfOrder.order_amount,
      currency: cfOrder.order_currency,
      gateway_status: cfOrder.order_status,
      payment_status: payments.map((p) => p.payment_status).join(",") || null,
      ok: true,
      message: `Cashfree reports ${cfOrder.order_status}`,
      raw: { order: cfOrder, payments },
    });

    if (cfOrder.order_status === "PAID") {
      const success = payments.find((p) => p.payment_status === "SUCCESS");
      const result = await markWooOrderPaid(wooOrderId, cfOrder, success);
      return json({
        payment_success: true,
        order_status: cfOrder.order_status,
        updated: result.updated || result.alreadyPaid,
        already_paid: result.alreadyPaid,
        payment_id: success ? String(success.cf_payment_id) : null,
      });
    }

    /* ------------------------------------------------------------------
     * Not PAID *yet*.
     *
     * This branch used to cancel the WooCommerce order whenever Cashfree
     * said ACTIVE, on the assumption that ACTIVE meant "the shopper closed
     * the popup". It does not. ACTIVE means "this order has no completed
     * payment yet" - which is exactly what Cashfree reports while a UPI
     * collect request sits on the customer phone waiting for a PIN. The
     * storefront calls us the moment the checkout modal closes, which on
     * mobile is when the UPI app takes over - seconds before the money
     * actually moves. Cancelling there marked genuinely paid orders as
     * cancelled (orders 59397, 59398 and dozens more on 2026-09-18).
     *
     * So: only a terminal Cashfree status closes an order. ACTIVE leaves it
     * pending, and the webhook (or the reconcile sweep) settles it when the
     * payment lands. Stock is released by WooCommerce own "Hold stock
     * (minutes)" setting, which is what that setting is for.
     * ------------------------------------------------------------------ */
    const TERMINAL = ["EXPIRED", "TERMINATED", "TERMINATION_REQUESTED"];
    const isTerminal = TERMINAL.includes(cfOrder.order_status);

    // A payment still in flight is the strongest possible signal to wait.
    const inFlight = payments.some((p) => ["PENDING", "SUCCESS", "NOT_ATTEMPTED"].includes(p.payment_status));

    let existingStatus: string | undefined;
    try {
      existingStatus = (await getWooOrder(wooOrderId))?.status;
    } catch {
      /* non-fatal: only used to fill in the log row */
    }

    if (isTerminal && !inFlight) {
      try {
        await updateWooOrder(wooOrderId, {
          status: "failed",
          meta_data: [
            { key: "_cashfree_order_id", value: cfOrder.order_id },
            { key: "_cashfree_order_status", value: cfOrder.order_status },
          ],
        });
        await logPayment({
          gateway: "cashfree", source: SOURCE, event: "marked_failed",
          woo_order_id: wooOrderId, gateway_order_id: cfOrder.order_id,
          amount: cfOrder.order_amount, currency: cfOrder.order_currency,
          gateway_status: cfOrder.order_status,
          woo_status_before: existingStatus ?? null, woo_status_after: "failed",
          ok: true, message: `Cashfree status ${cfOrder.order_status} is terminal`,
        });
      } catch (err) {
        console.warn("Could not mark WooCommerce order failed:", err);
        await logPayment({
          gateway: "cashfree", source: SOURCE, event: "error",
          woo_order_id: wooOrderId, gateway_order_id: cfOrder.order_id,
          gateway_status: cfOrder.order_status, ok: false,
          message: `Failed to mark order failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      // Stamp the gateway status on the order but leave the order status alone.
      try {
        await updateWooOrder(wooOrderId, {
          meta_data: [
            { key: "_cashfree_order_id", value: cfOrder.order_id },
            { key: "_cashfree_order_status", value: cfOrder.order_status },
          ],
        });
      } catch (err) {
        console.warn("Could not stamp Cashfree status on order:", err);
      }
      await logPayment({
        gateway: "cashfree", source: SOURCE, event: "left_pending",
        woo_order_id: wooOrderId, gateway_order_id: cfOrder.order_id,
        amount: cfOrder.order_amount, currency: cfOrder.order_currency,
        gateway_status: cfOrder.order_status,
        payment_status: payments.map((p) => p.payment_status).join(",") || null,
        woo_status_before: existingStatus ?? null, woo_status_after: existingStatus ?? null,
        ok: true,
        message: inFlight
          ? "Payment still in flight - order left pending for the webhook to settle"
          : "Not paid yet - order left pending rather than cancelled",
      });
    }

    return json({
      payment_success: false,
      order_status: cfOrder.order_status,
      // Tells the storefront not to claim the order was abandoned.
      pending: !isTerminal || inFlight,
      updated: false,
    });
  } catch (error) {
    console.error("verify-cashfree-payment error:", error);
    await logPayment({
      gateway: "cashfree",
      source: SOURCE,
      event: "error",
      woo_order_id: loggedWooId ?? null,
      gateway_order_id: loggedOrderId ?? null,
      ok: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
