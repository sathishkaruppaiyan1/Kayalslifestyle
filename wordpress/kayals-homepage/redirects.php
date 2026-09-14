<?php
/**
 * WordPress is the back office at app.kayalslifestyle.com; shoppers belong on
 * the React storefront. This sends every public-facing WordPress URL to the
 * right place and leaves the admin, login, REST API, uploads and AJAX alone.
 *
 *   app.…/product/<slug>/            → storefront /product/<id>
 *   app.…/product-category/<slug>/   → storefront /collections/<slug>
 *   app.…/shop/, tags, search        → storefront /collections/all
 *   app.…/  (or any other page)      → wp-admin (login page appears if logged out)
 *
 * Change the storefront address with the `kayals_storefront_url` filter or the
 * KAYALS_STOREFRONT_URL constant in wp-config.php.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function kayals_storefront_url() {
	$url = defined( 'KAYALS_STOREFRONT_URL' ) ? KAYALS_STOREFRONT_URL : 'https://kayalslifestyle.com';
	return rtrim( apply_filters( 'kayals_storefront_url', $url ), '/' );
}

function kayals_frontend_redirect() {
	// template_redirect never fires for wp-admin, wp-login.php, REST (/wp-json),
	// admin-ajax, cron or files under wp-content, so those keep working as-is.
	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return;
	}
	// Let WordPress serve its own sitemaps/feeds/robots; they exit before us anyway.
	if ( is_robots() || is_feed() ) {
		return;
	}

	$store = kayals_storefront_url();

	if ( function_exists( 'is_product' ) && is_product() ) {
		wp_redirect( $store . '/product/' . get_queried_object_id(), 301 );
		exit;
	}

	if ( function_exists( 'is_product_category' ) && is_product_category() ) {
		$term = get_queried_object();
		wp_redirect( $store . '/collections/' . ( $term ? $term->slug : 'all' ), 301 );
		exit;
	}

	if ( ( function_exists( 'is_shop' ) && is_shop() ) || ( function_exists( 'is_product_tag' ) && is_product_tag() ) || is_search() ) {
		wp_redirect( $store . '/collections/all', 301 );
		exit;
	}

	// Everything else on the WordPress front end (home, pages, posts, cart,
	// checkout, 404s) is for staff — send them to the dashboard.
	wp_redirect( admin_url(), 302 );
	exit;
}
add_action( 'template_redirect', 'kayals_frontend_redirect', 1 );
