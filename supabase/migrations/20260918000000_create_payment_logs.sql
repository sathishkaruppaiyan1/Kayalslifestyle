-- =============================================================================
-- payment_logs — an append-only audit trail for every payment attempt
-- =============================================================================
-- Why this exists: on 2026-09-18, orders 59397 and 59398 (and dozens more)
-- were marked "cancelled" in WooCommerce after the customer had paid. Nothing
-- outside the edge functions' short-lived console logs recorded what the
-- gateway actually said, so there was no way to tell a genuine abandonment
-- from a payment the code mislabelled.
--
-- Every gateway interaction now writes one row here. The table is the record
-- of truth for reconciliation: it can answer "did Cashfree say PAID, and what
-- did we do about it" for any order, long after the function logs have rolled
-- over.
--
-- Run in the Supabase SQL Editor, or via `supabase db push`. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_logs (
  id                  BIGSERIAL PRIMARY KEY,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who and what
  gateway             TEXT NOT NULL,              -- 'cashfree' | 'razorpay'
  source              TEXT NOT NULL,              -- edge function that wrote the row
  event               TEXT NOT NULL,              -- see the CHECK below

  -- Identifiers, all nullable: an early failure may know only some of them
  woo_order_id        BIGINT,
  gateway_order_id    TEXT,                       -- e.g. KL_59398_1789706479374
  gateway_payment_id  TEXT,                       -- cf_payment_id / razorpay_payment_id

  -- Money, as the gateway reported it
  amount              NUMERIC(12,2),
  currency            TEXT DEFAULT 'INR',

  -- What the gateway said vs. what we did to the WooCommerce order
  gateway_status      TEXT,                       -- ACTIVE | PAID | EXPIRED | captured | ...
  payment_status      TEXT,                       -- SUCCESS | PENDING | USER_DROPPED | FAILED
  woo_status_before   TEXT,
  woo_status_after    TEXT,

  ok                  BOOLEAN,                    -- did this step do what it meant to
  message             TEXT,                       -- human-readable outcome or error
  raw                 JSONB                       -- trimmed gateway payload, for forensics
);

-- `event` is a closed set so queries can rely on it. Extend deliberately.
DO $$
BEGIN
  ALTER TABLE public.payment_logs
    ADD CONSTRAINT payment_logs_event_check CHECK (event IN (
      'order_created',      -- gateway order opened for a Woo order
      'checkout_returned',  -- browser came back from the gateway UI
      'verify',             -- we asked the gateway for the real status
      'webhook',            -- gateway called us
      'marked_paid',        -- Woo order moved to processing + set_paid
      'already_paid',       -- mark-paid skipped, order was already settled
      'left_pending',       -- gateway not finished; Woo order deliberately untouched
      'marked_failed',      -- gateway reported a terminal failure
      'reconciled',         -- a sweep repaired an order after the fact
      'error'               -- the step itself blew up
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reconciliation and support lookups
CREATE INDEX IF NOT EXISTS idx_payment_logs_woo_order   ON public.payment_logs (woo_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_gw_order    ON public.payment_logs (gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created     ON public.payment_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_event       ON public.payment_logs (event, created_at DESC);
-- Partial index for the query that matters most: money in, order not settled.
CREATE INDEX IF NOT EXISTS idx_payment_logs_paid_events ON public.payment_logs (created_at DESC)
  WHERE gateway_status = 'PAID';


-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
--
-- Deliberately stricter than the other tables in this schema. Those use
-- permissive `USING (true)` policies; this table holds payment identifiers and
-- customer order values, so it gets RLS enabled with NO policy at all.
-- Postgres denies by default, which locks out anon and authenticated callers
-- (including anyone holding the publishable key). The service role bypasses
-- RLS, so the edge functions still write normally.
--
-- Do not add a permissive policy here to "make it work" from the browser.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.payment_logs;
DROP POLICY IF EXISTS "Allow all payment log operations" ON public.payment_logs;


-- ─────────────────────────────────────────────────────────────────────────────
-- Reconciliation views
-- ─────────────────────────────────────────────────────────────────────────────

-- Every order the gateway ever called PAID, with the last thing we did to it.
-- Cross-check against WooCommerce: anything here that is still pending or
-- cancelled in the store is money received against an unfulfilled order.
CREATE OR REPLACE VIEW public.payment_logs_paid_orders AS
SELECT
  woo_order_id,
  gateway,
  MIN(created_at)                                          AS first_seen,
  MAX(created_at)                                          AS last_seen,
  MAX(gateway_order_id)                                    AS gateway_order_id,
  MAX(gateway_payment_id)  FILTER (WHERE gateway_payment_id IS NOT NULL) AS gateway_payment_id,
  MAX(amount)                                              AS amount,
  BOOL_OR(event IN ('marked_paid', 'already_paid', 'reconciled')) AS settled_in_woo,
  ARRAY_AGG(DISTINCT event)                                AS events
FROM public.payment_logs
WHERE gateway_status = 'PAID' AND woo_order_id IS NOT NULL
GROUP BY woo_order_id, gateway;

COMMENT ON VIEW public.payment_logs_paid_orders IS
  'Orders the gateway confirmed as PAID. settled_in_woo = false means the payment was taken but the WooCommerce order was never moved to processing — investigate immediately.';

-- Housekeeping. Payment logs are evidence; keep them well beyond the window
-- in which a chargeback or customer complaint can arrive.
CREATE OR REPLACE FUNCTION public.purge_old_payment_logs(keep_days INT DEFAULT 400)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.payment_logs
  WHERE created_at < NOW() - (keep_days || ' days')::INTERVAL;
$$;
