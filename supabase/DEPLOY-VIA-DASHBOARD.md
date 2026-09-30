# Deploying the edge functions by hand (Supabase Dashboard)

For when the CLI isn't available. You paste each function's source into the
Dashboard editor, one at a time.

**Dashboard → Edge Functions → Deploy a new function**, for project
`rzeopubfxaytrrnbthhm`.

For every function the routine is the same:

1. Click **Deploy a new function**
2. **Name it exactly** as the folder name in `supabase/functions/` — the name
   *is* the URL, and the app calls these by exact path
3. Paste the entire contents of that folder's `index.ts`, replacing the sample
4. Set **Verify JWT** per the tables below
5. Deploy

Order matters only in that #1 proves your secrets are right before you paste
twenty-five more.

---

## Before you start

Secrets must exist or the functions deploy fine and then fail at runtime.
**Dashboard → Edge Functions → Secrets**. Minimum for the storefront:

```
WOOCOMMERCE_STORE_URL       https://admin.blacklovers.in
WOOCOMMERCE_CONSUMER_KEY    ck_...
WOOCOMMERCE_CONSUMER_SECRET cs_...
SUPABASE_URL                https://rzeopubfxaytrrnbthhm.supabase.co
SUPABASE_SERVICE_ROLE_KEY   sb_secret_...
SUPABASE_ANON_KEY           sb_publishable_DeUAMIGBVq7wVvymUoT00Q_tK4HSXH2
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` may be injected automatically —
check the Secrets page first and only add what's missing.

---

## Step 1 — prove the pipeline works

Deploy this one first. It needs **no secrets at all**, so if it works the
Dashboard flow is sound; if it fails, the problem is the flow, not your config.

| Name | `pincode-lookup` |
| --- | --- |
| Source | `supabase/functions/pincode-lookup/index.ts` (90 lines) |
| Verify JWT | **off** |
| Secrets | none |

Test:

```bash
curl "https://rzeopubfxaytrrnbthhm.supabase.co/functions/v1/pincode-lookup?pincode=600001" \
  -H "apikey: sb_publishable_DeUAMIGBVq7wVvymUoT00Q_tK4HSXH2"
```

A JSON response means you're good. Keep going.

---

## Step 2 — the catalogue (nothing renders without these)

Deploy in this order; `woocommerce-products` is the one the homepage and every
listing depends on.

| # | Name | Lines | Verify JWT | Notes |
| --- | --- | --- | --- | --- |
| 2 | `woocommerce-products` | 1090 | **off** | biggest file; also serves single product + gallery |
| 3 | `woocommerce-categories` | 93 | **off** | category strip, tabs, filter |
| 4 | `home-banners` | 125 | **off** | hero; only needs `WOOCOMMERCE_STORE_URL` |
| 5 | `woocommerce-reviews` | 270 | **off** | product reviews |
| 6 | `woocommerce-orders` | 199 | **off** | order history |
| 7 | `woocommerce-pages` | 116 | **off** | CMS pages (About, Terms…) |
| 8 | `woocommerce-payment-gateways` | 78 | **off** | checkout payment options |

After #2, check the storefront:

```bash
curl "https://rzeopubfxaytrrnbthhm.supabase.co/functions/v1/woocommerce-products?per_page=1" \
  -H "apikey: sb_publishable_DeUAMIGBVq7wVvymUoT00Q_tK4HSXH2"
```

If this returns `{"products":[...]}` your WooCommerce keys are correct. An empty
array or an error means the consumer key/secret or store URL is wrong — fix that
before deploying anything else.

At this point `npm run dev` should show a working storefront. Login and
checkout won't work yet.

---

## Step 3 — login (WhatsApp OTP)

⚠ **These six import a shared file.** Each one starts with:

```ts
import { corsHeaders, json, sendTemplate } from "../_shared/whatsapp.ts";
```

The Dashboard editor supports multiple files. For each of these functions you
must **add a second file** at path `_shared/whatsapp.ts` and paste
`supabase/functions/_shared/whatsapp.ts` (146 lines) into it. If your editor
version doesn't allow sibling folders, paste the contents of `whatsapp.ts`
directly at the top of `index.ts` and delete the import line — the exports it
provides are `corsHeaders`, `json`, `sendTemplate`, `toLocalNumber`,
`toWhatsAppNumber`.

| # | Name | Lines | Verify JWT | Needs `_shared` |
| --- | --- | --- | --- | --- |
| 9 | `whatsapp-send-otp` | 238 | **off** | no (inlined) |
| 10 | `whatsapp-verify-otp` | 118 | **off** | yes |
| 11 | `whatsapp-order-notification` | 201 | **off** | no (inlined) |

Extra secrets: `WATI_API_ENDPOINT`, `WATI_ACCESS_TOKEN`, and optionally
`WATI_OTP_TEMPLATE` / `WATI_ORDER_TEMPLATE` if the WATI templates are not
named `kayals_otp` / `kayals_order_confirmation`.

Test by attempting a login on the site — the OTP row should appear in the
`otps` table.

---

## Step 4 — payments

Deploy only the provider you actually use.

### Razorpay

| # | Name | Lines | Verify JWT | Notes |
| --- | --- | --- | --- | --- |
| 12 | `create-razorpay-order` | 66 | **on** (default) | called from browser with the anon key |
| 13 | `verify-razorpay-payment` | 140 | **on** (default) | as above |
| 14 | `razorpay-webhook` | 242 | **OFF — required** | see warning below |

> **`razorpay-webhook` must have Verify JWT switched OFF.** Razorpay posts from
> its own servers with only an `x-razorpay-signature` header and cannot send a
> Supabase JWT. Leave JWT verification on and every webhook is rejected with 401
> before the handler runs. The function verifies Razorpay's HMAC signature
> itself — that is what secures it, not the JWT.

Then in the Razorpay dashboard add the webhook:

```
https://rzeopubfxaytrrnbthhm.supabase.co/functions/v1/razorpay-webhook
```

Event `payment.captured`, secret = your `RAZORPAY_WEBHOOK_SECRET`.

Secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

### Cashfree

These three are **self-contained** — paste each `index.ts` as-is, no extra
files needed (the shared helpers are inlined at the top of each file).

| # | Name | Verify JWT | Notes |
| --- | --- | --- | --- |
| 15 | `create-cashfree-order` | **off** | creates the Cashfree order, returns `payment_session_id` |
| 16 | `verify-cashfree-payment` | **off** | asks Cashfree whether the order is PAID, then marks the WooCommerce order paid |
| 17 | `cashfree-webhook` | **OFF — required** | Cashfree posts here with only an HMAC header; the function verifies it |

Secrets: `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`sandbox` or
`production`). The WhatsApp confirmation reuses `WATI_*` from Step 3. Get the App ID / Secret from
Cashfree dashboard → **Developers → API Keys** (there are separate test and
production keys — `CASHFREE_ENV` must match the pair you paste).

Then in the Cashfree dashboard → **Developers → Webhooks → Payment Gateway**
add:

```
https://rzeopubfxaytrrnbthhm.supabase.co/functions/v1/cashfree-webhook
```

and enable the **Payment Success** event. The webhook is the safety net for a
shopper whose browser closes after paying — without it that order stays
"pending" in WooCommerce.

WooCommerce side: install the official **Cashfree Payments** plugin (WooCommerce
→ Settings → Payments) and enable it — the storefront lists the gateway from
there and picks it by its id `cashfree`. The plugin's own keys are not used by
the storefront; it only needs to be enabled so the option appears.

---

## That's the 17 the app uses

Everything below is optional — nothing in the app calls it.

| Name | Why it's idle |
| --- | --- |
| `woocommerce-variation-gallery` | superseded; the gallery hook calls `woocommerce-products?id=` |
| `whatsapp-account-creation` | never invoked |
| `whatsapp-tracking-update` | never invoked |
| `whatsapp-send-review` | never invoked |

---

## Final check

```bash
URL=https://rzeopubfxaytrrnbthhm.supabase.co
KEY=sb_publishable_DeUAMIGBVq7wVvymUoT00Q_tK4HSXH2

for f in pincode-lookup woocommerce-products woocommerce-categories home-banners \
         woocommerce-reviews woocommerce-orders woocommerce-pages \
         woocommerce-payment-gateways whatsapp-send-otp whatsapp-verify-otp \
         whatsapp-order-notification create-razorpay-order verify-razorpay-payment \
         razorpay-webhook create-cashfree-order verify-cashfree-payment cashfree-webhook; do
  printf "%-32s %s\n" "$f" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL/functions/v1/$f" \
        -H "apikey: $KEY" -H "Authorization: Bearer $KEY")"
done
```

Anything showing **404** isn't deployed. **200/400/405** all mean the function
exists — 400/405 just mean it wanted different arguments or a POST, which is
fine for this check.

---

## Worth doing the CLI way eventually

Pasting 26 files by hand is slow and easy to get wrong (one mistyped name and
the app 404s against it). Once you can run `npx supabase login` on the account
that owns this project, the whole job is:

```bash
npx supabase link --project-ref rzeopubfxaytrrnbthhm
npx supabase functions deploy
```

`supabase/config.toml` already carries the correct Verify JWT setting for all 23
configured functions, so the CLI route also removes the risk of getting the
`razorpay-webhook` toggle wrong.
