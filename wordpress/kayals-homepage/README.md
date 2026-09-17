# Kayals Homepage Builder (WordPress plugin)

Lets you arrange the storefront homepage from WP admin — no code changes.

Sections you can add, reorder (drag), rename, and switch on/off:

| Section | What you control |
| --- | --- |
| **Top Bar** (every page) | the scrolling announcement messages above the header — plain text (optional link) or a WhatsApp number; drag order; on/off. Pre-filled with "Free Shipping in India", "15 to 20 Days Delivery Time" and the wholesale WhatsApp number |
| **Category Strip** | which categories appear in the round scroller above the hero, and their order |
| **Hero Banners** | slides — desktop image, optional mobile image, link, alt text |
| **Shop by Reels** | poster image, Instagram reel link, SHOP NOW destination, optional .mp4 |
| **Product Rail** | title + emoji, grid or carousel. Products are **hand-picked (drag to order)** — an empty list shows the **newest products automatically** — or taken from a **category**. Add as many rails as you like — Hot Sellers, Featured Picks, Wedding Edit… |
| **Browse by Category** | which categories become tabs, and their order |
| **Customer Reviews** | review images from the Media Library, optional caption |
| **Founder Story** | the “Our Story” block — heading, the line under it, the founders’ photo and caption, and the story itself in the normal WordPress editor. Split in two: an **opening** everyone sees and **the rest** behind the Read More button (leave that empty and the button disappears) |

The storefront reads the result from `GET /wp-json/kayals/v1/homepage`.

## Photo search ("search by photo" on the storefront)

Shoppers upload a photo and get look-alike products from the **whole
catalogue**. That works off an **image index** — a fingerprint of every
product image — which you build from this plugin:

1. **Homepage → Photo search → Build index.** It runs in your browser (about
   1–3 minutes for ~700 products) and shows progress. Keep the tab in front.
2. After adding products, click **Update index (new products only)** — a few
   seconds.

The index is stored at `wp-content/uploads/kayals-homepage/image-index.json`
(~1 MB). The storefront reads `GET /wp-json/kayals/v1/image-index` for the
current version and downloads the file through
`GET /wp-json/kayals/v1/image-index/file` (REST, so it works from a storefront
on a different domain — the static uploads path has no CORS headers);
`GET /wp-json/kayals/v1/products?ids=…` returns the matched products in order.
Until the index is built, the storefront falls back to colour matching.

Other helpers: `GET /wp-json/kayals/v1/thumbs?ids=…` (medium-size images) and
a CORS header written once to `wp-content/uploads/.htaccess`.

## Redirects (WordPress as back office)

With WordPress on `app.kayalslifestyle.com` and the storefront on
`kayalslifestyle.com`, `redirects.php` sends public WordPress URLs away:

| Opened on app.… | Goes to |
| --- | --- |
| `/product/<slug>/` | `kayalslifestyle.com/product/<id>` |
| `/product-category/<slug>/` | `kayalslifestyle.com/collections/<slug>` |
| `/shop/`, tags, search | `kayalslifestyle.com/collections/all` |
| home or any other page | `/wp-admin` (login page if logged out) |

Untouched: `/wp-admin`, `/wp-login.php`, `/wp-json/*`, `/wp-content/*`,
admin-ajax, cron. To change the storefront address add
`define( 'KAYALS_STOREFRONT_URL', 'https://…' );` to `wp-config.php`.

## Install

1. Zip this folder (`kayals-homepage/`) and upload it via **Plugins → Add New → Upload Plugin**, or copy it to `wp-content/plugins/kayals-homepage/`.
2. Activate **Kayals Homepage Builder**. WooCommerce must be active.
3. A new **Homepage** menu appears in the admin sidebar.

On first open it's pre-filled to match the current storefront (New Arrivals / Hot Sellers from tags, Featured Picks from the best-sellers category, etc.), so activating changes nothing until you edit and save.

## Storefront side

`VITE_WORDPRESS_URL` in the storefront `.env` must point at this WordPress site (it already does for the CMS pages). Nothing else to deploy: since 1.1 the plugin returns the product cards for each rail itself, in your order.

## Updating the plugin

Upload the new zip via **Plugins → Add New → Upload Plugin** and choose *Replace current with uploaded*, or overwrite the folder. Your saved layout is kept.

If the plugin is deactivated or unreachable, the storefront silently falls back to its built-in homepage.

## Notes

- Saved layout is cached for 5 minutes on the WordPress side and invalidated on save and on any product/category change.
- Hand-picked products that are later unpublished are skipped automatically.
- Leaving a category list empty means "all categories" (strip: top-level only; tabs: every category), in WooCommerce's own order.
- A rail with nothing picked (or no category chosen) shows the newest products, so New Arrivals works out of the box and no rail ever goes blank. Product tags are not used.
- The founder story is pre-filled with the text the storefront already showed, so upgrading to 1.6 changes nothing until you edit it. Leave its photo empty to keep the one that ships with the storefront.
- Switching the story section off hides it: from 1.6 the storefront stops falling back to its own built-in copy.
