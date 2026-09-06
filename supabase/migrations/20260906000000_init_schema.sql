-- =============================================================================
-- Kayals Lifestyle — full schema for a fresh Supabase project
-- =============================================================================
-- Consolidates the four earlier migrations into one idempotent script. Safe to
-- run more than once: every object is guarded, and policies are dropped before
-- being recreated (Postgres has no CREATE POLICY IF NOT EXISTS).
--
-- Run this in the Supabase SQL Editor, or via `supabase db push`.
--
-- Tables created:
--   otps           short-lived OTP codes for WhatsApp login
--   users          customer profiles keyed by phone number
--   review_media   images/videos attached to product reviews
--   product_cache  shared WooCommerce response cache across function isolates
--
-- Storage buckets: review-media (public)
--
-- ⚠ Read the SECURITY NOTE at the bottom before going live.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OTP codes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.otps (
  id            BIGSERIAL PRIMARY KEY,
  phone_key     VARCHAR(25) UNIQUE NOT NULL,  -- "+919876543210"
  phone_number  VARCHAR(20),                  -- bare 10-digit, for compatibility
  otp           VARCHAR(10) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  verified      BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_otps_phone_key    ON public.otps (phone_key);
CREATE INDEX IF NOT EXISTS idx_otps_phone_number ON public.otps (phone_number);
CREATE INDEX IF NOT EXISTS idx_otps_expires_at   ON public.otps (expires_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Customers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id            BIGSERIAL PRIMARY KEY,
  phone_number  VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(255),
  email         VARCHAR(255),
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone_number ON public.users (phone_number);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Review media
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       INTEGER NOT NULL,
  product_id      INTEGER NOT NULL,
  media_urls      TEXT[] NOT NULL DEFAULT '{}',
  reviewer_email  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_media_review_id  ON public.review_media (review_id);
CREATE INDEX IF NOT EXISTS idx_review_media_product_id ON public.review_media (product_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Shared WooCommerce response cache
--    Every edge-function isolate reads/writes here instead of each one hitting
--    WooCommerce independently.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_cache (
  cache_key      TEXT PRIMARY KEY,
  response_data  JSONB NOT NULL,
  cached_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_cache_cached_at ON public.product_cache (cached_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.otps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_media  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cache ENABLE ROW LEVEL SECURITY;

-- otps / product_cache: only ever touched by edge functions (service role).
DROP POLICY IF EXISTS "Allow all OTP operations" ON public.otps;
CREATE POLICY "Allow all OTP operations"
  ON public.otps FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.product_cache;
CREATE POLICY "Service role full access"
  ON public.product_cache FOR ALL USING (true) WITH CHECK (true);

-- review_media: publicly readable, written by edge functions.
DROP POLICY IF EXISTS "Anyone can view review media" ON public.review_media;
CREATE POLICY "Anyone can view review media"
  ON public.review_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role can insert review media" ON public.review_media;
CREATE POLICY "Service role can insert review media"
  ON public.review_media FOR INSERT WITH CHECK (true);

-- users: see the SECURITY NOTE at the bottom of this file.
DROP POLICY IF EXISTS "Allow all user operations" ON public.users;
CREATE POLICY "Allow all user operations"
  ON public.users FOR ALL USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Storage: review media bucket
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-media', 'review-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for review media" ON storage.objects;
CREATE POLICY "Public read access for review media"
  ON storage.objects FOR SELECT USING (bucket_id = 'review-media');

DROP POLICY IF EXISTS "Service role can upload review media" ON storage.objects;
CREATE POLICY "Service role can upload review media"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'review-media');


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Housekeeping: drop expired OTPs
--    Call from a scheduled job, or leave it and the table grows slowly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_expired_otps()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.otps WHERE expires_at < NOW() - INTERVAL '1 day';
$$;


-- =============================================================================
-- ⚠ SECURITY NOTE — public.users is world-readable and world-writable
-- =============================================================================
-- The "Allow all user operations" policy above reproduces the behaviour of the
-- current project so the app keeps working. It is NOT safe for production:
--
--   The anon key ships inside the JavaScript bundle, so anyone can run
--     SELECT * FROM users;        -> every customer's name, email and phone
--     UPDATE users SET ...;       -> overwrite any customer's details
--
-- src/pages/Account.tsx is the only browser code that touches this table
-- (it updates name/email filtered by phone_number). To close the hole:
--
--   1. Move that update into an edge function that uses SUPABASE_SERVICE_ROLE_KEY
--      and derives the phone number from a verified OTP session, then
--   2. Replace the policy above with:
--
--        DROP POLICY IF EXISTS "Allow all user operations" ON public.users;
--        REVOKE ALL ON public.users FROM anon, authenticated;
--        -- service_role bypasses RLS, so the edge functions keep working
--
-- Until then, treat the users table as public data.
-- =============================================================================
