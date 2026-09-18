/**
 * payment_logs writer — the audit trail for every gateway interaction.
 *
 * Source of truth for the copies inlined into the payment functions (they
 * inline their helpers so each one can be pasted into the Dashboard editor).
 * Keep this file and those copies in step.
 *
 * Design rules, both of which matter:
 *
 *  1. Logging never breaks a payment. Every call is wrapped; a failure to log
 *     is reported to the console and swallowed. A broken log table must not
 *     cost a customer their order.
 *
 *  2. Nothing sensitive goes in `raw`. Gateway payloads can carry card and
 *     VPA details, so `raw` is passed through a whitelist before it is
 *     stored. Do not widen it without thinking about what lands in the DB.
 */

export type PaymentLogEvent =
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

export interface PaymentLogRow {
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

/** Fields we are willing to persist. Everything else in a payload is dropped. */
const RAW_ALLOWED = new Set([
  "order_id",
  "cf_order_id",
  "order_status",
  "order_amount",
  "order_currency",
  "cf_payment_id",
  "payment_status",
  "payment_amount",
  "payment_group",
  "payment_time",
  "payment_message",
  "bank_reference",
  "type",
  "event_time",
  "razorpay_order_id",
  "razorpay_payment_id",
  "status",
  "method",
  "amount",
  "currency",
  "error_code",
  "error_description",
]);

const scrub = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return null;
  if (depth > 3) return "[deep]";
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!RAW_ALLOWED.has(k)) continue;
      out[k] = typeof v === "object" ? scrub(v, depth + 1) : v;
    }
    return out;
  }
  if (typeof value === "string") return value.slice(0, 500);
  return value;
};

const toNumberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Append one row. Uses the service role key so it works under the table's
 * deny-by-default RLS. Returns nothing and throws nothing.
 */
export async function logPayment(row: PaymentLogRow): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

    if (!url || !key) {
      console.warn("[payment_log] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — not logging");
      return;
    }

    const body = {
      gateway: row.gateway,
      source: row.source,
      event: row.event,
      woo_order_id: toNumberOrNull(row.woo_order_id),
      gateway_order_id: row.gateway_order_id ?? null,
      gateway_payment_id: row.gateway_payment_id ?? null,
      amount: toNumberOrNull(row.amount),
      currency: row.currency ?? "INR",
      gateway_status: row.gateway_status ?? null,
      payment_status: row.payment_status ?? null,
      woo_status_before: row.woo_status_before ?? null,
      woo_status_after: row.woo_status_after ?? null,
      ok: row.ok ?? null,
      message: row.message ? String(row.message).slice(0, 2000) : null,
      raw: row.raw === undefined ? null : scrub(row.raw),
    };

    const res = await fetch(`${url}/rest/v1/payment_logs`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`[payment_log] insert failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  } catch (err) {
    console.warn("[payment_log] insert threw:", err);
  }
}
