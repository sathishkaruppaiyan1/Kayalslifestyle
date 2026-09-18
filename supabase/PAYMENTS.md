# Payments — how it works, and the 2026-09-18 incident

## The incident, in one paragraph

Customers paid by UPI through Cashfree; WooCommerce showed the order as
**cancelled** or **pending**. Two independent faults combined. First,
`verify-cashfree-payment` cancelled any order Cashfree still described as
`ACTIVE` — but `ACTIVE` means "no completed payment **yet**", which is exactly
what Cashfree reports while a UPI request is sitting on the customer's phone
waiting for a PIN. Second, the webhook that exists to correct precisely this
was being rejected by Supabase with HTTP 401 before our code ran, because
**Verify JWT was left ON** for the `cashfree-webhook` function. The first fault
mislabelled paid orders; the second made the mislabelling permanent.

## Evidence

Orders 59397 and 59398, both ₹899, both Cashfree:

| | 59397 | 59398 |
| --- | --- | --- |
| created | 10:10:15 | 10:11:17 |
| cancelled | 10:10:27 | 10:11:26 |
| elapsed | **12 s** | **9 s** |
| `_cashfree_order_status` | `ACTIVE` | `ACTIVE` |
| `transaction_id` | empty | empty |

The only order note is `Order status changed from Pending payment to
Cancelled.` with no user attribution — a programmatic change, not a human one.
Nine seconds is far too fast for WooCommerce's own hold-stock cancellation
(60 minutes by default), and `date_modified` equals the cancel time on both,
so nothing ever wrote to them again: the webhook never arrived.

Across the 100 most recent orders (2026-09-17 23:05 → 2026-09-18 10:33, all
Cashfree):

| status | count | signature |
| --- | --- | --- |
| pending | 44 | no `_cashfree_order_status`; modified 0–4 s after creation — the browser never came back |
| cancelled | 38 | 37 of them `_cashfree_order_status: ACTIVE`, median 29 s after creation — the cancel-on-ACTIVE bug |
| processing | 15 | 10 with a real `_cashfree_payment_id` |
| completed | 3 | |

Only 18 of 100 reached a paid state.

Widening to seven days (159 unsettled orders, all Cashfree) and bucketing by
what the metadata implies:

| bucket | n | value | reading |
| --- | --- | --- | --- |
| cancelled while Cashfree said `ACTIVE` | 53 | ₹59,997 | highest risk — the fault-1 signature |
| pending, Cashfree order exists | 82 | ₹79,994 | possible — reached the gateway, browser never returned |
| pending, no Cashfree order created | 8 | ₹3,596 | unlikely to have been paid |
| other | 16 | ₹17,712 | |

**₹1,39,991 across 135 orders needs a Cashfree cross-check.** Note that the
`pending` bucket carries `_cashfree_order_id` — only `_cashfree_order_status`
is missing, because that field is written by verify/webhook rather than at
creation. Those orders did reach Cashfree and a customer could well have paid,
so they are not safe to dismiss.

Confirming the webhook was dead:

```
$ curl -X POST https://<project>.supabase.co/functions/v1/cashfree-webhook \
       -H 'Content-Type: application/json' -d '{"type":"PING"}'
{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}  # HTTP 401
```

That is Supabase's gateway, not our handler — our code would have answered
`Invalid signature`. Cashfree cannot send a Supabase JWT, so **every webhook
Cashfree ever sent was rejected**. `razorpay-webhook` answers 404: it is not
deployed at all, so the Razorpay flow has no backstop either.

## Why it hit UPI hardest

```
create order in Woo (pending)
  └─ create Cashfree order          ACTIVE
      └─ open checkout modal
          └─ customer taps UPI → phone switches to GPay/PhonePe
              │  ← modal closes / promise resolves HERE, money has not moved
              └─ verify-cashfree-payment → Cashfree says ACTIVE
                  └─ OLD CODE: cancel the Woo order        ← the damage
          └─ customer enters PIN, payment succeeds (seconds later)
              └─ Cashfree fires PAYMENT_SUCCESS_WEBHOOK
                  └─ Supabase: 401, Verify JWT is ON       ← no repair
```

The 44 `pending` orders are the same root problem one step earlier: on mobile
the tab is often discarded during the app switch, so the JS after
`cashfree.checkout()` never runs at all and nothing calls verify. Confirmation
depended entirely on the customer's browser tab surviving — with a backstop
that was switched off.

## What changed in the code

- **`verify-cashfree-payment`** — only a *terminal* Cashfree status
  (`EXPIRED`, `TERMINATED`, `TERMINATION_REQUESTED`) now closes an order, and
  even then not if a payment is still in flight. `ACTIVE` leaves the order
  `pending` and returns `pending: true`. Stock is released by WooCommerce's
  own **Hold stock (minutes)** setting, which is what it is for.
- **`Checkout.tsx`** — verify is now polled for up to 45 s instead of asked
  once, which catches most UPI completions while the shopper is still looking
  at the page. When it is still unsettled the shopper is told we are
  confirming and **not** to pay again; the old copy said "No payment was
  charged", which was sometimes false. The `catch` no longer cancels the order
  — it also fires on a network blip after payment.
- **`payment_logs`** — every gateway interaction now leaves a row
  (migration `20260918000000_create_payment_logs.sql`). See below.
- **`reconcile-cashfree-orders`** — new function that finds orders Cashfree
  considers paid but WooCommerce does not, and repairs them.

## What has to be done by hand

The code changes are committed but none of them are live yet. The ordered
checklist is **Manual rollout checklist** below — table, functions, the
Verify JWT switch, secrets, the storefront build, and recovery.

## Recovering the affected orders

### Option A — from your machine, no deploy needed

`scripts/cashfree_crosscheck.py` does the same job as the edge function but
runs locally, so recovery does not have to wait on a Supabase deploy. It needs
`CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` and `CASHFREE_ENV=production` in
`.env`, and is read-only until you pass `--apply`:

```bash
python scripts/cashfree_crosscheck.py --orders 59397,59398   # the known two
python scripts/cashfree_crosscheck.py --days 7 --csv report.csv
python scripts/cashfree_crosscheck.py --days 7 --apply       # repair
```

It works out the WordPress host by probing, because `WOOCOMMERCE_STORE_URL` in
`.env` is the storefront and answers every path with the SPA’s HTML.

`--apply` moves paid orders to `processing` and stamps the payment id, but does
**not** send the WhatsApp confirmation — those customers need telling another
way, or run Option B once it is deployed.

### Option B — the edge function

Deploy the functions, run the migration, then dry-run the sweep — it reports
and changes nothing unless you pass `dry_run: false`:

```bash
# the two known orders
curl -X POST https://<project>.supabase.co/functions/v1/reconcile-cashfree-orders \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"order_ids":[59397,59398]}'

# everything from the last 7 days
curl -X POST .../reconcile-cashfree-orders \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"days":7,"limit":500}'

# then, having read the report:
#   -d '{"days":7,"limit":500,"dry_run":false}'
```

Each finding is one of `would_recover` (Cashfree took the money, WooCommerce
disagrees), `genuinely_unpaid`, `no_gateway_order` (no Cashfree order was ever
created — check the Cashfree dashboard by phone and amount), or `error`.
`money_at_stake` totals the recoverable ones. Recovered orders move to
`processing`, get their `transaction_id`, and send the WhatsApp confirmation
the customer never received.

Keep Verify JWT **ON** for this function — it moves live orders.

## Manual rollout checklist (Supabase dashboard)

Nothing in this fix is live until these steps are done. Do them in order;
each one has a check so you are never guessing whether it worked.

### 1. Create the payment_logs table

Supabase → **SQL Editor** → New query. Paste the whole of
`supabase/migrations/20260918000000_create_payment_logs.sql` and Run.
It is idempotent, so running it twice is harmless.

*Check:* Table Editor shows `payment_logs`, and

```sql
SELECT * FROM payment_logs_paid_orders;
```

runs (returning no rows yet).

### 2. Deploy the four edge functions

Supabase → **Edge Functions**. Each file is self-contained — the Cashfree,
WooCommerce, WhatsApp and logging helpers are inlined precisely so you can
paste one file with no bundler. Open each function, replace the whole body,
Deploy.

| Function | File | New? |
| --- | --- | --- |
| `create-cashfree-order` | `supabase/functions/create-cashfree-order/index.ts` | update |
| `verify-cashfree-payment` | `supabase/functions/verify-cashfree-payment/index.ts` | update — **this is the bug fix** |
| `cashfree-webhook` | `supabase/functions/cashfree-webhook/index.ts` | update |
| `reconcile-cashfree-orders` | `supabase/functions/reconcile-cashfree-orders/index.ts` | **create new** |

You do **not** need to set `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`:
Supabase injects both into every edge function, which is what the
`payment_logs` writer uses.

### 3. Turn Verify JWT OFF for cashfree-webhook — the important one

Edge Functions → `cashfree-webhook` → **Details** → *Verify JWT with legacy
secret* → **off**.

Cashfree cannot send a Supabase JWT, so while this is on, every webhook is
rejected with 401 before the handler runs. This is fault 2 — the reason the
mislabelled orders were never repaired. The handler still authenticates every
request by HMAC signature against `CASHFREE_SECRET_KEY`, so switching this off
does not open the endpoint.

Leave Verify JWT **ON** for `reconcile-cashfree-orders`: it moves live orders.

*Check:*

```bash
curl -X POST https://<project>.supabase.co/functions/v1/cashfree-webhook \
     -H 'Content-Type: application/json' -d '{"type":"PING"}'
```

- `Invalid signature` → correct, your handler ran.
- `UNAUTHORIZED_NO_AUTH_HEADER` → still off-limits to Cashfree, redo this step.

### 4. Confirm the edge function secrets

Project Settings → **Edge Functions** → Secrets. These are *separate* from the
local `.env`; changing `.env` does nothing to deployed functions.

- `CASHFREE_ENV` = `production` — it defaults to `sandbox` when unset, and a
  sandbox lookup never finds a live order
- `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` — must match that environment
- `WOOCOMMERCE_STORE_URL` — must be the **WordPress** host
  (`https://app.kayalslifestyle.com`), not the storefront. The storefront
  answers every path with the SPA’s HTML and no order update will ever land.

### 5. Register the webhook in Cashfree

Cashfree → Developers → **Webhooks** → add
`https://<project>.supabase.co/functions/v1/cashfree-webhook` for
`PAYMENT_SUCCESS_WEBHOOK`. `create-cashfree-order` also sends it per-order as
`notify_url`, so this is belt-and-braces.

### 6. Deploy the storefront

Separate from Supabase. The `Checkout.tsx` change (45-second verify poll, no
false "no payment was charged", no cancel-on-error) ships with the front end:

```bash
npm run build      # then upload dist/ as you normally do
```

### 7. Prove it end to end

Place one real ₹1 order over UPI on a phone, and pay it.

```sql
-- should show order_created -> verify -> marked_paid (and a webhook row)
SELECT created_at, source, event, gateway_status, woo_status_before,
       woo_status_after, message
FROM payment_logs ORDER BY created_at DESC LIMIT 20;
```

The order should read **processing** in WooCommerce. If it reads pending for a
minute and then flips to processing, that is the webhook doing its job —
exactly what was broken.

### 8. Recover the three outstanding orders

Still cancelled as of 2026-09-18: **58987** (₹1 test), **59289** (₹899) and
**59386** (₹899). Cashfree confirms all three as PAID.

```bash
python scripts/cashfree_crosscheck.py --days 30            # confirm the list
python scripts/cashfree_crosscheck.py --days 30 --apply    # repair
```

Then re-run without `--apply`: a clean run reports `would_recover: 0`.

Two things the script does not do: it sends no WhatsApp confirmation (those
customers were never told their order went through), and it will not fix
59397/59398, which were set to processing by hand and so no longer look
unsettled. If you want the Cashfree payment ids on those two for your books,
add them manually — `--orders 59397,59398` skips them by design.

### 9. Rotate the leaked credentials

`.env` was tracked in a **public** GitHub repo until 2026-09-18 (commit
`d1408d9` untracked it). These were readable by anyone and are still in the
history, which cannot be unpublished:

- **WooCommerce** consumer key + secret — full read/write on the store
- **Razorpay** key secret and webhook secret
- **Supabase** project keys

Reissue all of them, then update the local `.env` *and* the Supabase edge
function secrets. Cashfree was blank in every published commit and the WATI
token was added after the untracking, so neither is exposed.

## The payment log

`public.payment_logs` is append-only and holds one row per gateway
interaction: `order_created`, `verify`, `webhook`, `marked_paid`,
`already_paid`, `left_pending`, `marked_failed`, `reconciled`, `error`.

RLS is enabled with **no policy**, which denies anon and authenticated callers
(including anyone holding the publishable key) while the service role bypasses
it. This is deliberately stricter than the other tables in `init_schema.sql`,
which use permissive `USING (true)` policies — payment identifiers and order
values should not be readable from the browser. Do not add a permissive policy
to "make it work" from the storefront. `raw` is whitelisted before storage so
card and VPA details never reach the database.

The query that matters — money in, order not settled:

```sql
SELECT * FROM payment_logs_paid_orders WHERE NOT settled_in_woo;
```

Others worth knowing:

```sql
-- everything that happened to one order, in order
SELECT created_at, source, event, gateway_status, woo_status_before,
       woo_status_after, message
FROM payment_logs WHERE woo_order_id = 59398 ORDER BY created_at;

-- is the webhook alive? should be non-zero every day
SELECT date_trunc('day', created_at) AS day, count(*)
FROM payment_logs WHERE source = 'cashfree-webhook'
GROUP BY 1 ORDER BY 1 DESC;

-- attempts that started and never settled
SELECT woo_order_id, min(created_at) AS started, array_agg(DISTINCT event) AS events
FROM payment_logs
WHERE created_at > now() - interval '2 days'
GROUP BY woo_order_id
HAVING NOT bool_or(event IN ('marked_paid','already_paid','reconciled','marked_failed'));
```

Logging never throws and never blocks a payment: a failed insert is warned to
the console and swallowed. A broken log table must not cost a customer their
order.

## Deploying

The functions inline their shared helpers so each file can be pasted straight
into the Dashboard editor. Source of truth for the copies lives in
`supabase/functions/_shared/`; keep them in step.

```bash
supabase db push                                    # payment_logs + views
supabase functions deploy create-cashfree-order
supabase functions deploy verify-cashfree-payment
supabase functions deploy cashfree-webhook --no-verify-jwt
supabase functions deploy reconcile-cashfree-orders
```

`--no-verify-jwt` on the webhook is fault 2's fix. The handler still
authenticates every request by HMAC signature against `CASHFREE_SECRET_KEY`,
so the endpoint is not open — it just stops Supabase rejecting Cashfree before
our signature check runs.
