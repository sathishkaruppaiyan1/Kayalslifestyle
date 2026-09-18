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

const SOURCE = "reconcile-cashfree-orders";

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
 * Repair sweep for orders whose payment was taken but whose WooCommerce
 * status never caught up.
 *
 * Needed because two faults combined on 2026-09-18: verify-cashfree-payment
 * cancelled any order Cashfree still called ACTIVE (which is what Cashfree
 * says while a UPI PIN is being entered), and the webhook that should have
 * corrected it was being rejected by Supabase before it ran. Both are fixed,
 * but the orders they damaged need bringing back by hand.
 *
 * Walks recent Cashfree orders that are not settled, asks Cashfree what
 * really happened, and marks the paid ones processing.
 *
 * POST {
 *   dry_run?: boolean,   // default TRUE - report only, change nothing
 *   statuses?: string[],  // default ["pending","cancelled","failed","on-hold"]
 *   days?: number,        // how far back to look, default 7, max 90
 *   limit?: number,       // max orders to examine, default 100, max 500
 *   order_ids?: number[], // just these WooCommerce orders, ignores the filters
 * }
 *
 * Leave Verify JWT ON for this function: it moves orders and must not be
 * callable by the public.
 */

const DEFAULT_STATUSES = ["pending", "cancelled", "failed", "on-hold"];

interface Finding {
  woo_order_id: number;
  woo_status: string;
  cashfree_order_id: string | null;
  cashfree_status: string | null;
  payment_id: string | null;
  amount: number | string | null;
  action: "would_recover" | "recovered" | "genuinely_unpaid" | "no_gateway_order" | "error";
  detail?: string;
}

const listWooOrders = async (statuses: string[], days: number, limit: number) => {
  const { storeUrl, auth } = wooConfig();
  const after = new Date(Date.now() - days * 86400_000).toISOString().replace(/\.\d{3}Z$/, "");
  const out: any[] = [];
  const perPage = 100;

  for (let page = 1; out.length < limit && page <= 10; page++) {
    const url =
      `${storeUrl}/wp-json/wc/v3/orders` +
      `?per_page=${perPage}&page=${page}&orderby=id&order=desc` +
      `&status=${encodeURIComponent(statuses.join(","))}` +
      `&after=${encodeURIComponent(after)}`;
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`WooCommerce order list failed (${res.status})`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < perPage) break;
  }
  return out.slice(0, limit);
};

const metaValue = (order: any, key: string): string => {
  const hit = (order?.meta_data ?? []).find((m: any) => m?.key === key);
  return hit ? String(hit.value ?? "") : "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    // Defaults to a dry run on purpose: this function writes to live orders,
    // so making a change has to be asked for explicitly.
    const dryRun = body?.dry_run !== false;
    const statuses: string[] = Array.isArray(body?.statuses) && body.statuses.length
      ? body.statuses.map(String)
      : DEFAULT_STATUSES;
    const days = Math.min(90, Math.max(1, Number(body?.days) || 7));
    const limit = Math.min(500, Math.max(1, Number(body?.limit) || 100));
    const onlyIds: number[] = Array.isArray(body?.order_ids)
      ? body.order_ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : [];

    let orders: any[];
    if (onlyIds.length) {
      orders = [];
      for (const id of onlyIds.slice(0, limit)) {
        try {
          orders.push(await getWooOrder(id));
        } catch (err) {
          console.warn("Could not load order", id, err);
        }
      }
    } else {
      orders = await listWooOrders(statuses, days, limit);
    }

    const findings: Finding[] = [];

    for (const order of orders) {
      const wooId = Number(order.id);
      const gateway = String(order.payment_method || "").toLowerCase();
      if (!gateway.includes("cashfree")) continue;
      if (["processing", "completed", "refunded"].includes(order.status)) continue;

      const cfOrderId = metaValue(order, "_cashfree_order_id");
      if (!cfOrderId) {
        // create-cashfree-order stamps this id before the shopper can pay, so
        // its absence means the payment attempt never really started. Nothing
        // to look up; surfaced so it can be checked in the Cashfree dashboard.
        findings.push({
          woo_order_id: wooId,
          woo_status: order.status,
          cashfree_order_id: null,
          cashfree_status: null,
          payment_id: null,
          amount: order.total ?? null,
          action: "no_gateway_order",
          detail: "No _cashfree_order_id on the order - no Cashfree order was ever created for it",
        });
        continue;
      }

      try {
        const cfOrder = await getCashfreeOrder(cfOrderId);
        const payments = await getCashfreePayments(cfOrderId);
        const success = payments.find((p) => p.payment_status === "SUCCESS");

        if (cfOrder.order_status === "PAID") {
          if (dryRun) {
            findings.push({
              woo_order_id: wooId,
              woo_status: order.status,
              cashfree_order_id: cfOrderId,
              cashfree_status: cfOrder.order_status,
              payment_id: success ? String(success.cf_payment_id) : null,
              amount: cfOrder.order_amount,
              action: "would_recover",
              detail: `Cashfree took ${cfOrder.order_amount} but the order reads ${order.status}`,
            });
          } else {
            const result = await markWooOrderPaid(wooId, cfOrder, success);
            await logPayment({
              gateway: "cashfree",
              source: SOURCE,
              event: "reconciled",
              woo_order_id: wooId,
              gateway_order_id: cfOrderId,
              gateway_payment_id: success ? String(success.cf_payment_id) : null,
              amount: cfOrder.order_amount,
              currency: cfOrder.order_currency,
              gateway_status: cfOrder.order_status,
              payment_status: success?.payment_status ?? null,
              woo_status_before: order.status,
              woo_status_after: result.alreadyPaid ? order.status : "processing",
              ok: true,
              message: `Reconciled from ${order.status}`,
              raw: { order: cfOrder, payment: success },
            });
            findings.push({
              woo_order_id: wooId,
              woo_status: order.status,
              cashfree_order_id: cfOrderId,
              cashfree_status: cfOrder.order_status,
              payment_id: success ? String(success.cf_payment_id) : null,
              amount: cfOrder.order_amount,
              action: "recovered",
              detail: result.alreadyPaid ? "Was already settled" : "Moved to processing and paid",
            });
          }
        } else {
          findings.push({
            woo_order_id: wooId,
            woo_status: order.status,
            cashfree_order_id: cfOrderId,
            cashfree_status: cfOrder.order_status,
            payment_id: null,
            amount: cfOrder.order_amount,
            action: "genuinely_unpaid",
            detail: `Cashfree says ${cfOrder.order_status}` +
              (payments.length ? ` (attempts: ${payments.map((p) => p.payment_status).join(", ")})` : " (no payment attempted)"),
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("Reconcile failed for order", wooId, message);
        findings.push({
          woo_order_id: wooId,
          woo_status: order.status,
          cashfree_order_id: cfOrderId,
          cashfree_status: null,
          payment_id: null,
          amount: order.total ?? null,
          action: "error",
          detail: message,
        });
      }
    }

    const tally = findings.reduce<Record<string, number>>((acc, f) => {
      acc[f.action] = (acc[f.action] ?? 0) + 1;
      return acc;
    }, {});

    const recoverable = findings.filter((f) => f.action === "would_recover" || f.action === "recovered");
    const moneyAtStake = recoverable.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

    console.log("Reconcile summary:", JSON.stringify({ dryRun, tally, moneyAtStake }));

    return json({
      dry_run: dryRun,
      examined: findings.length,
      mode: cashfreeMode(),
      tally,
      money_at_stake: Number(moneyAtStake.toFixed(2)),
      findings,
      next_step: dryRun && recoverable.length
        ? "Re-send the same request with {\"dry_run\": false} to apply these recoveries."
        : undefined,
    });
  } catch (error) {
    console.error("reconcile-cashfree-orders error:", error);
    await logPayment({
      gateway: "cashfree",
      source: SOURCE,
      event: "error",
      ok: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
