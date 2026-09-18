#!/usr/bin/env python3
"""
Cross-check unsettled WooCommerce orders against Cashfree, and optionally
repair the ones Cashfree says were paid.

This is the same job as the `reconcile-cashfree-orders` edge function, but it
runs from your machine. It exists because recovery should not have to wait on
a Supabase deploy: it needs nothing but the credentials in .env.

Read-only unless you pass --apply.

    # what does Cashfree actually say about our unsettled orders?
    python scripts/cashfree_crosscheck.py

    # just the two known ones
    python scripts/cashfree_crosscheck.py --orders 59397,59398

    # having read the report, repair the paid ones
    python scripts/cashfree_crosscheck.py --apply

Needs in .env: the WooCommerce consumer key/secret, CASHFREE_APP_ID,
CASHFREE_SECRET_KEY, and CASHFREE_ENV=production. The WordPress host is worked
out by probing VITE_WORDPRESS_URL and WOOCOMMERCE_STORE_URL, because in this
project the latter is the storefront and does not serve the REST API.

Note: --apply moves the order to processing and stamps the payment id, but it
does NOT send the WhatsApp confirmation (the edge function does that). Expect
to tell those customers yourself, or run the edge-function reconciler once it
is deployed.
"""
from __future__ import annotations

import argparse
import base64
import csv
import datetime
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNSETTLED = ["pending", "cancelled", "failed", "on-hold"]


# --------------------------------------------------------------------------- #
# config
# --------------------------------------------------------------------------- #

def load_env() -> dict:
    """Parse .env. Tolerates `KEY = "value"` spacing, which this file has."""
    env = {}
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        sys.exit("No .env found at %s" % path)
    for line in io.open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def require(env: dict, *names: str) -> str:
    for name in names:
        if env.get(name):
            return env[name]
    sys.exit("Missing in .env: %s" % " / ".join(names))


def resolve_store(env: dict, headers: dict) -> str:
    """Find the host serving the WooCommerce REST API.

    In this project WOOCOMMERCE_STORE_URL is the React storefront, which
    answers every path with the SPA's index.html; WordPress lives on a
    separate host (VITE_WORDPRESS_URL). Rather than trusting either name,
    probe them and keep the one that returns JSON.
    """
    candidates = []
    for name in ("VITE_WORDPRESS_URL", "WOOCOMMERCE_STORE_URL"):
        value = (env.get(name) or "").rstrip("/")
        if value and value not in candidates:
            candidates.append(value)
    if not candidates:
        sys.exit("Missing in .env: VITE_WORDPRESS_URL / WOOCOMMERCE_STORE_URL")

    for base in candidates:
        status, body = request("%s/wp-json/wc/v3/orders?per_page=1" % base, headers)
        if status == 200 and isinstance(body, list):
            return base
        reason = "HTTP %s" % status
        if isinstance(body, dict):
            reason = body.get("message") or ("not JSON" if "_raw" in body else reason)
        print("  %s does not serve the WooCommerce API (%s)" % (base, reason))

    sys.exit("Could not reach the WooCommerce REST API on: %s" % ", ".join(candidates))


# --------------------------------------------------------------------------- #
# http
# --------------------------------------------------------------------------- #

def request(url: str, headers: dict, method: str = "GET", body: dict | None = None):
    """Returns (status, parsed). `parsed` is {"_raw": ...} when the body is not
    JSON - which happens when a URL points at the storefront instead of the
    WordPress REST API, and is worth reporting rather than crashing on."""
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        headers = dict(headers, **{"Content-Type": "application/json"})
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    def parse(code, raw):
        text = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)
        try:
            return code, json.loads(text or "null")
        except ValueError:
            return code, {"_raw": text[:300]}

    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return parse(res.status, res.read())
    except urllib.error.HTTPError as err:
        return parse(err.code, err.read())
    except urllib.error.URLError as err:
        return 0, {"_raw": "connection failed: %s" % err.reason}


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7, help="how far back to look (default 7)")
    ap.add_argument("--orders", default="", help="comma-separated WooCommerce order ids; ignores --days")
    ap.add_argument("--apply", action="store_true", help="actually repair the paid orders")
    ap.add_argument("--csv", default="", help="also write the findings to this path")
    args = ap.parse_args()

    env = load_env()
    wc_key = require(env, "WOOCOMMERCE_CONSUMER_KEY")
    wc_secret = require(env, "WOOCOMMERCE_CONSUMER_SECRET")
    cf_id = require(env, "CASHFREE_APP_ID")
    cf_secret = require(env, "CASHFREE_SECRET_KEY")
    cf_env = (env.get("CASHFREE_ENV") or "sandbox").lower()

    cf_base = "https://api.cashfree.com" if cf_env == "production" else "https://sandbox.cashfree.com"
    wc_headers = {
        "Authorization": "Basic " + base64.b64encode(
            ("%s:%s" % (wc_key, wc_secret)).encode()).decode(),
    }
    store = resolve_store(env, wc_headers)
    cf_headers = {
        "x-client-id": cf_id,
        "x-client-secret": cf_secret,
        "x-api-version": "2023-08-01",
    }

    print("WooCommerce: %s" % store)
    print("Cashfree   : %s (CASHFREE_ENV=%s)" % (cf_base, cf_env))
    if cf_env != "production":
        print("  !! Not production. Live orders will not be found here.")
    print("Mode       : %s" % ("APPLY - will modify orders" if args.apply else "read-only report"))
    print()

    # ---- collect the orders to examine ----
    orders = []
    if args.orders:
        for raw in args.orders.split(","):
            raw = raw.strip()
            if not raw:
                continue
            status, body = request("%s/wp-json/wc/v3/orders/%s" % (store, raw), wc_headers)
            if status == 200:
                orders.append(body)
            else:
                print("  could not load order %s (HTTP %s)" % (raw, status))
    else:
        after = (datetime.datetime.now(datetime.timezone.utc)
                 - datetime.timedelta(days=args.days)).strftime("%Y-%m-%dT%H:%M:%S")
        for page in range(1, 11):
            query = urllib.parse.urlencode({
                "per_page": 100, "page": page, "orderby": "id", "order": "desc",
                "status": ",".join(UNSETTLED), "after": after,
            })
            status, body = request("%s/wp-json/wc/v3/orders?%s" % (store, query), wc_headers)
            if status != 200 or not isinstance(body, list) or not body:
                break
            orders.extend(body)
            if len(body) < 100:
                break

    def meta(order, key):
        for m in order.get("meta_data", []):
            if m.get("key") == key:
                return str(m.get("value") or "")
        return ""

    targets = [
        o for o in orders
        if "cashfree" in (o.get("payment_method") or "").lower()
        and o.get("status") in UNSETTLED
    ]
    print("Examining %d unsettled Cashfree orders\n" % len(targets))

    findings = []
    recovered_value = 0.0

    for order in sorted(targets, key=lambda o: o["id"]):
        woo_id = order["id"]
        cf_order_id = meta(order, "_cashfree_order_id")

        if not cf_order_id:
            findings.append((woo_id, order["status"], "", "", "", order.get("total"),
                             "no_gateway_order", "no _cashfree_order_id on the order"))
            continue

        status, cf_order = request(
            "%s/pg/orders/%s" % (cf_base, urllib.parse.quote(cf_order_id)), cf_headers)
        if status != 200 or not isinstance(cf_order, dict):
            detail = ""
            if isinstance(cf_order, dict):
                detail = cf_order.get("message") or cf_order.get("_raw") or ""
            findings.append((woo_id, order["status"], cf_order_id, "", "", order.get("total"),
                             "error", "Cashfree lookup HTTP %s: %s"
                             % (status, str(detail)[:120])))
            continue

        cf_status = cf_order.get("order_status") or ""
        _, payments = request(
            "%s/pg/orders/%s/payments" % (cf_base, urllib.parse.quote(cf_order_id)), cf_headers)
        payments = payments if isinstance(payments, list) else []
        success = next((p for p in payments if p.get("payment_status") == "SUCCESS"), None)
        pay_id = str(success.get("cf_payment_id")) if success else ""
        amount = cf_order.get("order_amount")

        if cf_status == "PAID":
            if not args.apply:
                findings.append((woo_id, order["status"], cf_order_id, cf_status, pay_id,
                                 amount, "would_recover",
                                 "Cashfree took %s; order reads %s" % (amount, order["status"])))
                recovered_value += float(amount or 0)
            else:
                code, result = request(
                    "%s/wp-json/wc/v3/orders/%s" % (store, woo_id), wc_headers, "PUT",
                    {
                        "status": "processing",
                        "set_paid": True,
                        "transaction_id": pay_id or cf_order_id,
                        "meta_data": [
                            {"key": "_cashfree_order_id", "value": cf_order_id},
                            {"key": "_cashfree_cf_order_id", "value": cf_order.get("cf_order_id") or ""},
                            {"key": "_cashfree_payment_id", "value": pay_id},
                            {"key": "_cashfree_order_status", "value": cf_status},
                            {"key": "_kayals_reconciled_at",
                             "value": datetime.datetime.now(datetime.timezone.utc).isoformat()},
                        ],
                    })
                ok = code in (200, 201)
                findings.append((woo_id, order["status"], cf_order_id, cf_status, pay_id,
                                 amount, "recovered" if ok else "error",
                                 "moved to processing" if ok
                                 else "WooCommerce PUT HTTP %s: %s" % (code, str(result)[:120])))
                if ok:
                    recovered_value += float(amount or 0)
        else:
            attempts = ", ".join(p.get("payment_status", "?") for p in payments) or "none"
            findings.append((woo_id, order["status"], cf_order_id, cf_status, "", amount,
                             "genuinely_unpaid",
                             "Cashfree says %s (attempts: %s)" % (cf_status, attempts)))

    # ---- report ----
    tally = {}
    for f in findings:
        tally[f[6]] = tally.get(f[6], 0) + 1

    header = ("woo", "woo_status", "cashfree_order_id", "cf_status", "payment_id",
              "amount", "verdict", "detail")
    print("%-7s %-10s %-26s %-9s %-12s %-9s %-18s %s" % header)
    for f in findings:
        if f[6] in ("would_recover", "recovered", "error"):
            print("%-7s %-10s %-26s %-9s %-12s %-9s %-18s %s" % f)

    print()
    print("Tally: %s" % json.dumps(tally))
    print("Value of orders Cashfree confirms as PAID: Rs %.2f" % recovered_value)
    if not args.apply and tally.get("would_recover"):
        print()
        print("Re-run with --apply to move these %d orders to processing."
              % tally["would_recover"])
        print("Only 'would_recover' rows are touched; nothing else is modified.")

    if args.csv:
        with io.open(args.csv, "w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(header)
            writer.writerows(findings)
        print("\nCSV written: %s" % args.csv)

    return 0


if __name__ == "__main__":
    sys.exit(main())
