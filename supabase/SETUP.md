# Supabase setup — Kayals Lifestyle

Everything needed to stand this storefront up on a **fresh** Supabase project:
4 tables, 1 storage bucket, and 17 edge functions (26 exist; 9 are dormant).

The app keeps its catalogue in **WooCommerce**, not Postgres. Supabase does three
jobs only: caching WooCommerce responses, WhatsApp OTP login, and review media.
That is why the schema is small.

---

## 0. Prerequisites

```bash
npm install -g supabase        # or: brew install supabase/tap/supabase
supabase login
```

You will also need, from WooCommerce → Settings → Advanced → REST API, a
**Consumer Key** and **Consumer Secret** with Read/Write scope.

---

## 1. Create the project

Create it at <https://supabase.com/dashboard>, then note from
**Project Settings → API**:

| Value | Used as |
| --- | --- |
| Project URL | `VITE_SUPABASE_URL` and the `SUPABASE_URL` secret |
| `anon` / publishable key | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` secret — **server only, never in the frontend** |
| Reference ID | `VITE_SUPABASE_PROJECT_ID`, and the link step below |

```bash
supabase link --project-ref <your-project-ref>
```

---

## 2. Create the tables

Run **`supabase/migrations/20260906000000_init_schema.sql`** — paste it into the
SQL Editor, or:

```bash
supabase db push
```

It is idempotent, so re-running is safe. It creates:

| Table | Purpose |
| --- | --- |
| `otps` | short-lived WhatsApp OTP codes |
| `users` | customer profiles keyed by phone number |
| `review_media` | images/videos attached to product reviews |
| `product_cache` | shared WooCommerce response cache across function isolates |

plus the public **`review-media`** storage bucket, RLS policies, and a
`purge_expired_otps()` helper.

> **Read the SECURITY NOTE at the bottom of that file before going live** — the
> `users` policy is permissive by design so the app works out of the box, and it
> exposes customer data. Details in [Security](#security) below.

---

## 3. Set the edge-function secrets

Set them all in one call. Only the first three are mandatory for the storefront
to render products; the rest light up login and payments.

```bash
supabase secrets set \
  WOOCOMMERCE_STORE_URL="https://your-store.com" \
  WOOCOMMERCE_CONSUMER_KEY="ck_xxx" \
  WOOCOMMERCE_CONSUMER_SECRET="cs_xxx" \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_ANON_KEY="eyJ..." \
  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  INTERAKT_API_KEY="xxx" \
  RAZORPAY_KEY_ID="rzp_xxx" \
  RAZORPAY_KEY_SECRET="xxx" \
  RAZORPAY_WEBHOOK_SECRET="xxx" \
  EASEBUZZ_KEY="xxx" \
  EASEBUZZ_SALT="xxx" \
  EASEBUZZ_ENV="test" \
  WHATSAPP_ACCESS_TOKEN="xxx" \
  WHATSAPP_PHONE_NUMBER_ID="xxx" \
  WHATSAPP_API_VERSION="v21.0"
```

Which function needs what:

| Secret | Needed by |
| --- | --- |
| `WOOCOMMERCE_STORE_URL` | all 7 `woocommerce-*`, `home-banners`, both payment-verify functions, `razorpay-webhook` |
| `WOOCOMMERCE_CONSUMER_KEY` / `_SECRET` | all 7 `woocommerce-*`, payment-verify, `razorpay-webhook` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | OTP send/verify, `woocommerce-products`, `woocommerce-reviews`, `verify-easebuzz-payment` |
| `SUPABASE_ANON_KEY` | OTP send/verify, `verify-easebuzz-payment` |
| `INTERAKT_API_KEY` | the 6 `interakt-*` functions — only `interakt-order-notification` is reached, and only on the Easebuzz path |
| `RAZORPAY_*` | `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook` |
| `EASEBUZZ_*` | `initiate-easebuzz-payment`, `verify-easebuzz-payment` |
| `WHATSAPP_*` | `_shared/whatsapp.ts`, used by the `whatsapp-*` functions |

`home-banners` needs only `WOOCOMMERCE_STORE_URL`; `pincode-lookup` needs nothing.

---

## 4. Deploy the edge functions

All 26 live in `supabase/functions/` already — nothing to write, just deploy.
Only **17 of them are actually reached by the app**; the other 9 are dormant
(see below), so start with the 17.

Deploy from the repo root so `config.toml` (and its `verify_jwt` settings) apply.

### The 17 you need

```bash
# ── Catalogue and content ──────────────────────────────────────────────
supabase functions deploy woocommerce-products          # products, single product, gallery
supabase functions deploy woocommerce-categories
supabase functions deploy woocommerce-reviews
supabase functions deploy woocommerce-orders
supabase functions deploy woocommerce-pages
supabase functions deploy woocommerce-payment-gateways
supabase functions deploy home-banners                  # hero banners from WordPress
supabase functions deploy pincode-lookup                # checkout delivery check

# ── Login (WhatsApp OTP, Meta Cloud API) ───────────────────────────────
supabase functions deploy whatsapp-send-otp
supabase functions deploy whatsapp-verify-otp

# ── Order messaging ────────────────────────────────────────────────────
supabase functions deploy whatsapp-order-notification

# ── Payments ───────────────────────────────────────────────────────────
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
supabase functions deploy razorpay-webhook              # called by Razorpay, not the browser
supabase functions deploy initiate-easebuzz-payment
supabase functions deploy verify-easebuzz-payment
supabase functions deploy interakt-order-notification   # invoked by verify-easebuzz-payment
```

If you only take one payment provider you can drop the other's functions:

* **Razorpay only** — skip `initiate-easebuzz-payment`, `verify-easebuzz-payment`
  and `interakt-order-notification` (nothing else calls it). 14 functions.
* **Easebuzz only** — skip `create-razorpay-order`, `verify-razorpay-payment`
  and `razorpay-webhook`. 14 functions.

### The 9 nothing calls

Present in the repo but not referenced by the frontend or by any other function.
They are alternative or half-finished paths, safe to leave undeployed:

| Function | Why it is idle |
| --- | --- |
| `woocommerce-variation-gallery` | superseded — the gallery hook calls `woocommerce-products?id=` instead |
| `whatsapp-account-creation` | never invoked |
| `whatsapp-tracking-update` | never invoked; presumably for shipment updates |
| `whatsapp-send-review` | never invoked; presumably a post-delivery review nudge |
| `interakt-send-otp` | Interakt is a second WhatsApp provider; the app uses the Meta `whatsapp-*` pair |
| `interakt-verify-otp` | as above |
| `interakt-account-creation` | as above |
| `interakt-send-review` | as above |
| `interakt-tracking-update` | as above |

Deploy them only if you plan to switch to Interakt or wire up tracking and
review messages. To deploy everything regardless:

```bash
supabase functions deploy      # all 26
```

### Razorpay webhook

Point Razorpay at:

```
https://<ref>.supabase.co/functions/v1/razorpay-webhook
```

Subscribe to `payment.captured` and use the same secret you set as
`RAZORPAY_WEBHOOK_SECRET`. This function **must** stay `verify_jwt = false` —
Razorpay posts from its own servers with only an `x-razorpay-signature` header
and cannot present a Supabase JWT. With JWT verification on, every webhook is
rejected with 401 before the handler gets to check the signature. The function
verifies that HMAC signature itself, which is what actually secures it.

---

## 5. Point the frontend at the new project

`.env` in the repo root:

```dotenv
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=<ref>
VITE_WORDPRESS_URL=https://your-store.com
VITE_RAZORPAY_KEY_ID=rzp_xxx
```

Only these five are read by the browser. Everything else belongs in
`supabase secrets` — anything prefixed `VITE_` is compiled into the public
JavaScript bundle and is readable by any visitor.

---

## 6. Verify

```bash
# Should return JSON with a products array
curl "https://<ref>.supabase.co/functions/v1/woocommerce-products?per_page=1" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"

# Tables exist
supabase db diff --schema public
```

Then `npm run dev` and check the homepage loads products, the category strip
fills, and the archive filter shows Size and Colour chips.

---

## Security

Three things to settle before real customers use this.

**1. `public.users` is world-readable and world-writable.** The seed policy is
`FOR ALL USING (true)`, and the anon key is public. Anyone can dump every
customer's name, email and phone, or overwrite them. The fix and the reason it
was left permissive are documented at the bottom of the schema file.

**2. Never expose `SUPABASE_SERVICE_ROLE_KEY` or `RAZORPAY_KEY_SECRET` to the
browser.** They bypass RLS and can move money. They belong only in
`supabase secrets`. Note the existing `.env` has a `VITE_RAZORPAY_KEY_SECRET`
entry — that prefix would ship the secret to the browser if any code ever read
it. Nothing does today (verified against the built bundle), but rename it to
`RAZORPAY_KEY_SECRET` so it can't happen by accident.

**3. Rotate anything already committed.** If the current keys have been in a
repo or shared, rotate them in WooCommerce, Razorpay and Supabase rather than
carrying them to the new project.

---

## Reference: what runs where

| Concern | Where it lives |
| --- | --- |
| Products, categories, reviews, pages, orders | WooCommerce, proxied through edge functions |
| Hero banners | WordPress posts in a `home-banners` category |
| Response caching | `product_cache` table (10s list / 2s detail TTL) |
| Login | WhatsApp OTP → `otps` + `users` tables |
| Review photos | `review_media` table + `review-media` storage bucket |
| Payments | Razorpay and Easebuzz edge functions |
