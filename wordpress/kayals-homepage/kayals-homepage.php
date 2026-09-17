<?php
/**
 * Plugin Name: Kayals Homepage Builder
 * Description: Build the storefront homepage from WP admin — top bar messages, category strip, hero banners, reels, product rails (Hot Sellers, Featured Picks…), browse-by-category tabs, customer review images and the founder story. Drag to reorder; the React storefront reads everything from /wp-json/kayals/v1/homepage.
 * Version:     1.6.0
 * Author:      Kayals Lifestyle
 * Requires Plugins: woocommerce
 * License:     GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Kayals_Homepage {

	const OPTION     = 'kayals_homepage';
	const TRANSIENT  = 'kayals_homepage_public';
	const CAP        = 'manage_woocommerce';
	const REST_NS    = 'kayals/v1';
	const VERSION    = '1.6.0';

	/** Section types and the fields each one carries. Anything else is dropped on save. */
	const TYPES = array( 'category_strip', 'hero', 'reels', 'products', 'category_tabs', 'reviews', 'story' );

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'admin_assets' ) );
		add_action( 'wp_ajax_kayals_hp_save', array( __CLASS__, 'ajax_save' ) );
		add_action( 'wp_ajax_kayals_hp_search_products', array( __CLASS__, 'ajax_search_products' ) );
		add_action( 'wp_ajax_kayals_hp_products_by_ids', array( __CLASS__, 'ajax_products_by_ids' ) );
		add_action( 'wp_ajax_kayals_hp_save_index', array( __CLASS__, 'ajax_save_index' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'rest_routes' ) );
		add_filter( 'rest_pre_serve_request', array( __CLASS__, 'rest_cors_headers' ), 20, 3 );
		add_action( 'admin_init', array( __CLASS__, 'ensure_uploads_cors' ) );

		// Any catalogue change can alter a rail, so drop the cached payload.
		foreach ( array( 'save_post_product', 'deleted_post', 'created_product_cat', 'edited_product_cat', 'delete_product_cat' ) as $hook ) {
			add_action( $hook, array( __CLASS__, 'flush_cache' ) );
		}
	}

	public static function flush_cache() {
		delete_transient( self::TRANSIENT );
	}

	/* ------------------------------------------------------------------ */
	/* Admin                                                                */
	/* ------------------------------------------------------------------ */

	public static function admin_menu() {
		add_menu_page(
			'Homepage Builder',
			'Homepage',
			self::CAP,
			'kayals-homepage',
			array( __CLASS__, 'render_admin' ),
			'dashicons-layout',
			56
		);
	}

	public static function render_admin() {
		echo '<div class="wrap kayals-hp-wrap"><h1>Homepage Builder</h1>';
		echo '<p class="description">Drag sections to reorder them. Changes go live on the storefront as soon as you save.</p>';
		echo '<div id="kayals-hp-app"><p>Loading…</p></div></div>';
	}

	public static function admin_assets( $hook ) {
		if ( 'toplevel_page_kayals-homepage' !== $hook ) {
			return;
		}
		wp_enqueue_media();
		// TinyMCE + Quicktags for the founder story's prose fields; the admin
		// app builds those textareas at runtime and calls wp.editor.initialize.
		wp_enqueue_editor();
		wp_enqueue_style( 'kayals-hp', plugins_url( 'admin/app.css', __FILE__ ), array(), self::VERSION );
		// Photo-search indexer: TensorFlow.js + MobileNet, loaded only on this admin page.
		wp_enqueue_script( 'kayals-tfjs', 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', array(), '4.22.0', true );
		wp_enqueue_script( 'kayals-mobilenet', 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js', array( 'kayals-tfjs' ), '2.1.1', true );
		wp_enqueue_script( 'kayals-hp', plugins_url( 'admin/app.js', __FILE__ ), array( 'jquery', 'jquery-ui-sortable', 'kayals-mobilenet' ), self::VERSION, true );

		wp_localize_script(
			'kayals-hp',
			'KayalsHP',
			array(
				'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
				'nonce'      => wp_create_nonce( 'kayals_hp' ),
				'data'       => self::get_config(),
				'categories' => self::all_terms( 'product_cat' ),
				'restUrl'    => rest_url( self::REST_NS . '/homepage' ),
				'restBase'   => rest_url( self::REST_NS ),
				'index'      => self::index_status(),
			)
		);
	}

	/* ------------------------------------------------------------------ */
	/* Photo-search image index                                             */
	/*                                                                      */
	/* The storefront's photo search compares a shopper's photo against a   */
	/* fingerprint of every product image. Those fingerprints are computed  */
	/* in the admin's browser (Homepage → Photo search → Build index) and   */
	/* stored as one file under uploads; the storefront downloads it once.  */
	/* ------------------------------------------------------------------ */

	const INDEX_MODEL = 'mobilenet-v2-a0.50';
	const INDEX_DIM   = 1280;

	private static function index_paths() {
		$upload = wp_upload_dir();
		$dir    = trailingslashit( $upload['basedir'] ) . 'kayals-homepage';
		$url    = trailingslashit( $upload['baseurl'] ) . 'kayals-homepage';
		return array( 'dir' => $dir, 'file' => $dir . '/image-index.json', 'url' => $url . '/image-index.json' );
	}

	private static function published_product_count() {
		$counts = wp_count_posts( 'product' );
		return isset( $counts->publish ) ? (int) $counts->publish : 0;
	}

	public static function index_status() {
		$meta  = get_option( 'kayals_hp_index_meta' );
		$paths = self::index_paths();
		$has   = is_array( $meta ) && file_exists( $paths['file'] );
		return array(
			'built'    => $has,
			'count'    => $has ? (int) $meta['count'] : 0,
			'version'  => $has ? (string) $meta['version'] : '',
			'built_at' => $has ? (string) $meta['built_at'] : '',
			'model'    => self::INDEX_MODEL,
			'dim'      => self::INDEX_DIM,
			'catalog'  => self::published_product_count(),
			// Served through REST rather than as a static upload: the storefront runs on
			// another domain and WordPress's REST layer sends the CORS headers uploads don't.
			'url'      => $has ? rest_url( self::REST_NS . '/image-index/file' ) . '?v=' . rawurlencode( (string) $meta['version'] ) : '',
		);
	}

	/** GET /catalog -> every published product with a medium-size image, for the indexer. */
	public static function rest_catalog() {
		$cached = get_transient( 'kayals_hp_catalog' );
		if ( false === $cached ) {
			$ids    = wc_get_products( array( 'status' => 'publish', 'limit' => -1, 'return' => 'ids' ) );
			$cached = array();
			foreach ( $ids as $id ) {
				$thumb_id = get_post_thumbnail_id( $id );
				$url      = $thumb_id ? wp_get_attachment_image_url( $thumb_id, 'medium' ) : '';
				if ( $url ) {
					$cached[] = array( 'id' => (string) $id, 'image' => $url );
				}
			}
			set_transient( 'kayals_hp_catalog', $cached, 10 * MINUTE_IN_SECONDS );
		}
		return new WP_REST_Response( array( 'count' => count( $cached ), 'products' => $cached ) );
	}

	/** GET /image-index -> where the storefront can download the index (404 until built). */
	public static function rest_image_index() {
		$status = self::index_status();
		if ( ! $status['built'] ) {
			return new WP_REST_Response( array( 'error' => 'Image index not built yet' ), 404 );
		}
		$response = new WP_REST_Response( $status );
		$response->header( 'Cache-Control', 'public, max-age=300' );
		return $response;
	}

	/** GET /image-index/file -> the index itself (raw JSON, cacheable, CORS-open). */
	public static function rest_image_index_file() {
		$paths = self::index_paths();
		if ( ! file_exists( $paths['file'] ) ) {
			return new WP_REST_Response( array( 'error' => 'Image index not built yet' ), 404 );
		}
		// Bypass WP_REST_Response: re-encoding a 1 MB JSON array through PHP is
		// slow and pointless when the file on disk already is the response.
		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Cache-Control: public, max-age=31536000, immutable' ); // URL carries ?v=<version>
		header( 'Content-Length: ' . filesize( $paths['file'] ) );
		readfile( $paths['file'] );
		exit;
	}

	/** GET /products?ids=1,2,3 -> product cards, in that order (search results). */
	public static function rest_products( WP_REST_Request $req ) {
		$ids = array_slice( array_filter( array_map( 'absint', explode( ',', (string) $req->get_param( 'ids' ) ) ) ), 0, 60 );
		$response = new WP_REST_Response( array( 'products' => self::product_cards( $ids ) ) );
		$response->header( 'Cache-Control', 'public, max-age=60' );
		return $response;
	}

	/** Admin saves the fingerprints the browser computed. */
	public static function ajax_save_index() {
		self::guard();
		$raw = wp_unslash( $_POST['index'] ?? '' );
		$idx = json_decode( $raw, true );
		if ( ! is_array( $idx ) || empty( $idx['ids'] ) || empty( $idx['data'] ) || ! is_array( $idx['ids'] ) ) {
			wp_send_json_error( 'Invalid index payload', 400 );
		}
		$count = count( $idx['ids'] );
		$bytes = strlen( base64_decode( $idx['data'], true ) ?: '' );
		if ( $bytes !== $count * self::INDEX_DIM ) {
			wp_send_json_error( "Index size mismatch ({$bytes} bytes for {$count} products)", 400 );
		}
		$paths = self::index_paths();
		wp_mkdir_p( $paths['dir'] );
		$version = gmdate( 'YmdHis' );
		$file    = array(
			'model'   => self::INDEX_MODEL,
			'dim'     => self::INDEX_DIM,
			'version' => $version,
			'ids'     => array_values( array_map( 'strval', $idx['ids'] ) ),
			'data'    => (string) $idx['data'],
		);
		if ( false === file_put_contents( $paths['file'], wp_json_encode( $file ) ) ) {
			wp_send_json_error( 'Could not write ' . $paths['file'], 500 );
		}
		update_option( 'kayals_hp_index_meta', array( 'count' => $count, 'version' => $version, 'built_at' => gmdate( 'c' ) ), false );
		delete_transient( 'kayals_hp_catalog' );
		wp_send_json_success( self::index_status() );
	}

	private static function all_terms( $taxonomy ) {
		$terms = get_terms( array( 'taxonomy' => $taxonomy, 'hide_empty' => false, 'orderby' => 'name' ) );
		if ( is_wp_error( $terms ) ) {
			return array();
		}
		$out = array();
		foreach ( $terms as $t ) {
			$out[] = array(
				'id'     => (int) $t->term_id,
				'name'   => $t->name,
				'slug'   => $t->slug,
				'parent' => (int) $t->parent,
				'count'  => (int) $t->count,
			);
		}
		return $out;
	}

	/* ------------------------------------------------------------------ */
	/* Storage                                                              */
	/* ------------------------------------------------------------------ */

	public static function get_config() {
		$config = get_option( self::OPTION );
		if ( ! is_array( $config ) || empty( $config['sections'] ) ) {
			return self::default_config();
		}
		if ( empty( $config['topbar'] ) || ! is_array( $config['topbar'] ) ) {
			$config['topbar'] = self::default_topbar();
		}
		// Earlier versions had tag-based and "latest" sources; both collapse
		// into "hand-picked, empty = newest" now.
		foreach ( $config['sections'] as &$sec ) {
			if ( 'products' === ( $sec['type'] ?? '' ) && in_array( $sec['source'] ?? '', array( 'tag', 'latest' ), true ) ) {
				$sec['source'] = 'manual';
			}
			unset( $sec['tag'] );
		}
		unset( $sec );

		// The founder story arrived in 1.6. Sites that saved a layout before
		// then have no story section, and the storefront falls back to its
		// built-in copy — so hand them the same copy, editable.
		$has_story = false;
		foreach ( $config['sections'] as $existing ) {
			if ( 'story' === ( $existing['type'] ?? '' ) ) {
				$has_story = true;
				break;
			}
		}
		if ( ! $has_story ) {
			$config['sections'][] = self::default_story_section();
		}

		return $config;
	}

	/** The announcement bar the storefront ships with today. */
	private static function default_topbar() {
		return array(
			'enabled' => true,
			'items'   => array(
				array( 'type' => 'text', 'text' => 'Free Shipping in India', 'phone' => '', 'link' => '' ),
				array( 'type' => 'text', 'text' => '15 to 20 Days Delivery Time', 'phone' => '', 'link' => '' ),
				array( 'type' => 'whatsapp', 'text' => 'For International & Wholesale Orders', 'phone' => '+91 8220027625', 'link' => '' ),
			),
		);
	}

	/** Mirrors what the storefront renders today so activating the plugin changes nothing until you edit. */
	private static function default_config() {
		$best     = self::find_term_by_prefix( 'product_cat', 'best-sellers' );
		$trending = self::find_term_by_prefix( 'product_cat', 'trending' );

		$sections = array(
			array( 'id' => 'strip', 'type' => 'category_strip', 'enabled' => true, 'title' => '', 'items' => array() ),
			array( 'id' => 'hero', 'type' => 'hero', 'enabled' => true, 'title' => '', 'items' => array() ),
			array( 'id' => 'reels', 'type' => 'reels', 'enabled' => true, 'title' => 'Shop by Reels', 'items' => array() ),
			// Hand-picked with nothing picked = newest products, so these show
			// the latest arrivals until someone curates them.
			array(
				'id' => 'new', 'type' => 'products', 'enabled' => true, 'title' => 'New Arrivals', 'emoji' => '🔥',
				'layout' => 'grid', 'source' => 'manual', 'category' => 0, 'limit' => 8, 'products' => array(), 'view_all' => '',
			),
			array(
				'id' => 'hot', 'type' => 'products', 'enabled' => true, 'title' => 'Hot Sellers', 'emoji' => '⚡',
				'layout' => 'grid', 'source' => 'manual', 'category' => 0, 'limit' => 8, 'products' => array(), 'view_all' => '',
			),
			array(
				'id' => 'featured', 'type' => 'products', 'enabled' => true, 'title' => 'Featured Picks', 'emoji' => '✨',
				'layout' => 'carousel', 'source' => 'category', 'category' => $best ? (int) $best->term_id : 0, 'limit' => 12, 'products' => array(), 'view_all' => '',
			),
			array(
				'id' => 'trending', 'type' => 'products', 'enabled' => (bool) $trending, 'title' => 'Trending Collections', 'emoji' => '🔥',
				'layout' => 'carousel', 'source' => 'category', 'category' => $trending ? (int) $trending->term_id : 0, 'limit' => 12, 'products' => array(), 'view_all' => '',
			),
			array( 'id' => 'tabs', 'type' => 'category_tabs', 'enabled' => true, 'title' => 'Browse by Category', 'items' => array() ),
			array( 'id' => 'reviews', 'type' => 'reviews', 'enabled' => true, 'title' => 'kayalslifestyle Family Happy Customers', 'items' => array() ),
			self::default_story_section(),
		);

		return array( 'topbar' => self::default_topbar(), 'sections' => $sections );
	}

	/**
	 * The founder story exactly as the storefront renders it today, so that
	 * upgrading to 1.6 changes nothing on screen until someone edits it.
	 *
	 * `image` is left empty on purpose: the portrait currently ships with the
	 * storefront as a static file, and the storefront keeps using that until
	 * an admin picks one from the Media Library here.
	 */
	private static function default_story_section() {
		$intro = <<<'HTML'
<p>Hi, I'm Kayal, one of the founders of <strong>Kayalslifestyle Boutique</strong>, alongside my sister Madhu.</p>
<p>From childhood, I have always loved dressing up. I was naturally drawn to clothes, colours, designs, fabrics, and the little details that make an outfit special. I was always curious about clothing and the world behind it.</p>
<p>My Appa had a passion for tailoring and creating, but somewhere along the way, he had to let go of that passion.</p>
<p>Watching that stayed with me.</p>
<p>And somewhere inside, I made a strong promise to myself:</p>
<blockquote><p>"The passion that my Appa had to leave behind… I will never let mine stop."</p></blockquote>
<p>That belief became one of the strongest reasons I wanted to build something of my own.</p>
<p>Somewhere along the way, that curiosity became a thought:</p>
<blockquote><p>"One day, I want to start something of my own in clothing."</p></blockquote>
<p>But I never imagined that this little thought would one day become Kayalslifestyle Boutique.</p>
<h3>It All Started During COVID</h3>
<p>In 2020, during the uncertainty of the COVID period, I decided to start Kayalslifestyle as a second source of income while I was working as an Accountant.</p>
<p>It was a small beginning.</p>
<p>It wasn't a huge business in the beginning.</p>
<p>It was simply a small step towards something I had always wanted to do.</p>
<p>I started with limited collections, learning everything along the way — understanding customers, selecting designs, handling orders, packing, communicating with customers, and slowly learning what women truly wanted.</p>
<p>There was no perfect business plan.</p>
<p>There was just faith, curiosity, and the courage to start.</p>
<p>And that little beginning slowly started becoming something much bigger.</p>
HTML;

		$more = <<<'HTML'
<h3>In 2024, my sister Madhu joined this journey</h3>
<p>After completing her college, Madhu joined me in 2024 and chose to fully dedicate herself to this business, leaving behind further job opportunities.</p>
<p>That was a very special turning point.</p>
<p>What started as my little dream became our shared dream.</p>
<p>Together, we started exploring more collections, understanding fashion trends, meeting suppliers, making decisions, handling challenges, and dreaming bigger.</p>
<h3>It gave us an identity</h3>
<p>Every order, every customer, every message, every repeat purchase, every new connection has been a small part of our journey.</p>
<p>Over these 6 years, we have earned something we value more than numbers.</p>
<h3>More Than a Boutique</h3>
<p>Kayalslifestyle is not simply a clothing business for us.</p>
<p>It is a reminder of where we came from.</p>
<p>It has given us opportunities we once only dreamed about.</p>
<p>It has given us confidence.</p>
<p>It has given us an identity.</p>
<p>And above all, it has taught us that you don't need to start big to build something meaningful.</p>
<p><strong>You just need to start — and never stop believing in your journey.</strong></p>
<h3>Six Years. Countless Lessons. One Beautiful Journey</h3>
<p>When we look back, we don't just see orders and sales.</p>
<p>We see people who trusted us.</p>
<p>From our early customers to the many women who continue to shop with us, every order has been a small chapter in our story.</p>
<p>We have been fortunate to send many shipments across India and abroad, receive wholesale orders, and create reselling opportunities for women entrepreneurs who wanted to start something of their own.</p>
<p>Being able to become a small part of another woman's entrepreneurial journey is something we are truly proud of.</p>
<h3>Kayalslifestyle is more than a business to us</h3>
<p>It is our passion, our identity, our family legacy, and the journey that brought us to where we are today.</p>
HTML;

		return array(
			'id'        => 'story',
			'type'      => 'story',
			'enabled'   => true,
			'title'     => 'Our Story',
			'subtitle'  => 'Two Sisters. One Dream. One Journey.',
			'image'     => '',
			'image_alt' => 'Kayal and Madhu, Founders of Kayalslifestyle Boutique',
			'name'      => 'Kayal & Madhu',
			'role'      => 'Founders, Kayalslifestyle Boutique',
			'intro'     => $intro,
			'more'      => $more,
			'read_more' => 'Read Full Story',
			'read_less' => 'Read Less',
		);
	}

	private static function find_term_by_prefix( $taxonomy, $prefix ) {
		$terms = get_terms( array( 'taxonomy' => $taxonomy, 'hide_empty' => false ) );
		if ( is_wp_error( $terms ) ) {
			return null;
		}
		foreach ( $terms as $t ) {
			if ( 0 === strpos( $t->slug, $prefix ) ) {
				return $t;
			}
		}
		return null;
	}

	/** Whitelist every field so the option can never carry markup or unknown keys. */
	private static function sanitize_config( $raw ) {
		$out = array( 'topbar' => self::sanitize_topbar( $raw['topbar'] ?? null ), 'sections' => array() );
		if ( ! is_array( $raw ) || empty( $raw['sections'] ) || ! is_array( $raw['sections'] ) ) {
			return $out;
		}

		foreach ( $raw['sections'] as $s ) {
			if ( ! is_array( $s ) || empty( $s['type'] ) || ! in_array( $s['type'], self::TYPES, true ) ) {
				continue;
			}
			$sec = array(
				'id'      => sanitize_key( $s['id'] ?? wp_generate_uuid4() ),
				'type'    => $s['type'],
				'enabled' => ! empty( $s['enabled'] ),
				'title'   => sanitize_text_field( $s['title'] ?? '' ),
			);
			$items = ( isset( $s['items'] ) && is_array( $s['items'] ) ) ? $s['items'] : array();

			switch ( $s['type'] ) {
				case 'category_strip':
				case 'category_tabs':
					$sec['items'] = array_values( array_filter( array_map( 'absint', array_map( function ( $i ) { return is_array( $i ) ? ( $i['id'] ?? 0 ) : $i; }, $items ) ) ) );
					break;

				case 'hero':
					$sec['items'] = array();
					foreach ( $items as $i ) {
						if ( ! is_array( $i ) || empty( $i['image'] ) ) {
							continue;
						}
						$sec['items'][] = array(
							'image'        => esc_url_raw( $i['image'] ),
							'mobile_image' => esc_url_raw( $i['mobile_image'] ?? '' ),
							'link'         => sanitize_text_field( $i['link'] ?? '' ),
							'alt'          => sanitize_text_field( $i['alt'] ?? '' ),
						);
					}
					break;

				case 'reels':
					$sec['items'] = array();
					foreach ( $items as $i ) {
						// A reel needs a video or, failing that, a product image to fill the card.
						if ( ! is_array( $i ) || ( empty( $i['thumb'] ) && empty( $i['video'] ) ) ) {
							continue;
						}
						$sec['items'][] = array(
							'title' => sanitize_text_field( $i['title'] ?? '' ),
							'thumb' => esc_url_raw( $i['thumb'] ?? '' ),
							'href'  => esc_url_raw( $i['href'] ?? '' ),
							'shop'  => sanitize_text_field( $i['shop'] ?? '' ),
							'video' => esc_url_raw( $i['video'] ?? '' ),
						);
					}
					break;

				case 'reviews':
					$sec['items'] = array();
					foreach ( $items as $i ) {
						if ( ! is_array( $i ) || empty( $i['image'] ) ) {
							continue;
						}
						$sec['items'][] = array(
							'image'   => esc_url_raw( $i['image'] ),
							'caption' => sanitize_text_field( $i['caption'] ?? '' ),
						);
					}
					break;

				case 'story':
					// Prose, so the two long fields keep the markup the editor
					// produces. wp_kses_post is WordPress's own post-content
					// filter: headings, emphasis and links survive, script and
					// event attributes do not.
					$sec['subtitle']  = sanitize_text_field( $s['subtitle'] ?? '' );
					$sec['image']     = esc_url_raw( $s['image'] ?? '' );
					$sec['image_alt'] = sanitize_text_field( $s['image_alt'] ?? '' );
					$sec['name']      = sanitize_text_field( $s['name'] ?? '' );
					$sec['role']      = sanitize_text_field( $s['role'] ?? '' );
					$sec['intro']     = wp_kses_post( $s['intro'] ?? '' );
					$sec['more']      = wp_kses_post( $s['more'] ?? '' );
					$read_more        = sanitize_text_field( $s['read_more'] ?? '' );
					$read_less        = sanitize_text_field( $s['read_less'] ?? '' );
					$sec['read_more'] = '' !== $read_more ? $read_more : 'Read Full Story';
					$sec['read_less'] = '' !== $read_less ? $read_less : 'Read Less';
					break;

				case 'products':
					$source = 'category' === ( $s['source'] ?? '' ) ? 'category' : 'manual';
					$layout = in_array( $s['layout'] ?? '', array( 'grid', 'carousel' ), true ) ? $s['layout'] : 'grid';
					$sec['emoji']    = sanitize_text_field( $s['emoji'] ?? '' );
					$sec['layout']   = $layout;
					$sec['source']   = $source;
					$sec['category'] = absint( $s['category'] ?? 0 );
					$sec['limit']    = max( 1, min( 48, absint( $s['limit'] ?? 8 ) ) );
					$sec['view_all'] = sanitize_text_field( $s['view_all'] ?? '' );
					$sec['products'] = array_values( array_filter( array_map( 'absint', (array) ( $s['products'] ?? array() ) ) ) );
					break;
			}

			$out['sections'][] = $sec;
		}
		return $out;
	}

	private static function sanitize_topbar( $raw ) {
		if ( ! is_array( $raw ) ) {
			return self::default_topbar();
		}
		$items = array();
		foreach ( ( isset( $raw['items'] ) && is_array( $raw['items'] ) ) ? $raw['items'] : array() as $i ) {
			if ( ! is_array( $i ) ) {
				continue;
			}
			$type = ( 'whatsapp' === ( $i['type'] ?? '' ) ) ? 'whatsapp' : 'text';
			$text = sanitize_text_field( $i['text'] ?? '' );
			$phone = sanitize_text_field( $i['phone'] ?? '' );
			if ( '' === $text && '' === $phone ) {
				continue;
			}
			$items[] = array(
				'type'  => $type,
				'text'  => $text,
				'phone' => 'whatsapp' === $type ? $phone : '',
				'link'  => 'text' === $type ? sanitize_text_field( $i['link'] ?? '' ) : '',
			);
		}
		return array( 'enabled' => ! empty( $raw['enabled'] ), 'items' => $items );
	}

	/* ------------------------------------------------------------------ */
	/* AJAX (admin only)                                                    */
	/* ------------------------------------------------------------------ */

	private static function guard() {
		check_ajax_referer( 'kayals_hp', 'nonce' );
		if ( ! current_user_can( self::CAP ) ) {
			wp_send_json_error( 'Not allowed', 403 );
		}
	}

	public static function ajax_save() {
		self::guard();
		$raw = json_decode( wp_unslash( $_POST['config'] ?? '' ), true );
		if ( null === $raw ) {
			wp_send_json_error( 'Invalid JSON', 400 );
		}
		$config = self::sanitize_config( $raw );
		update_option( self::OPTION, $config, false );
		self::flush_cache();
		wp_send_json_success( $config );
	}

	public static function ajax_search_products() {
		self::guard();
		$term = sanitize_text_field( wp_unslash( $_GET['q'] ?? '' ) );
		// Same search WooCommerce's own product picker uses: title, SKU, content.
		$store = WC_Data_Store::load( 'product' );
		$ids   = $store->search_products( $term, '', true, true, 20 );
		if ( empty( $ids ) ) {
			wp_send_json_success( array() );
		}
		$products = wc_get_products( array( 'include' => $ids, 'limit' => 20, 'status' => 'publish', 'orderby' => 'title', 'order' => 'ASC' ) );
		wp_send_json_success( array_map( array( __CLASS__, 'product_summary' ), $products ) );
	}

	public static function ajax_products_by_ids() {
		self::guard();
		$ids = array_filter( array_map( 'absint', explode( ',', sanitize_text_field( wp_unslash( $_GET['ids'] ?? '' ) ) ) ) );
		if ( empty( $ids ) ) {
			wp_send_json_success( array() );
		}
		$products = wc_get_products( array( 'include' => $ids, 'limit' => -1, 'status' => array( 'publish', 'draft', 'private' ) ) );
		// Keep the admin's order, not the DB's.
		$by_id = array();
		foreach ( $products as $p ) {
			$by_id[ $p->get_id() ] = self::product_summary( $p );
		}
		$out = array();
		foreach ( $ids as $id ) {
			if ( isset( $by_id[ $id ] ) ) {
				$out[] = $by_id[ $id ];
			}
		}
		wp_send_json_success( $out );
	}

	private static function product_summary( WC_Product $p ) {
		$image_id = $p->get_image_id();
		return array(
			'id'     => $p->get_id(),
			'name'   => $p->get_name(),
			'price'  => html_entity_decode( wp_strip_all_tags( wc_price( (float) $p->get_price() ) ), ENT_QUOTES, 'UTF-8' ),
			'status' => $p->get_status(),
			'image'  => $image_id ? wp_get_attachment_image_url( $image_id, 'thumbnail' ) : '',
			// Larger copy for places that display the product image itself (reel cards).
			'image_large' => $image_id ? wp_get_attachment_image_url( $image_id, 'large' ) : '',
		);
	}

	/* ------------------------------------------------------------------ */
	/* Public REST                                                          */
	/* ------------------------------------------------------------------ */

	public static function rest_routes() {
		register_rest_route(
			self::REST_NS,
			'/homepage',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'rest_homepage' ),
				'permission_callback' => '__return_true',
			)
		);
		foreach ( array( 'catalog' => 'rest_catalog', 'image-index' => 'rest_image_index', 'image-index/file' => 'rest_image_index_file', 'products' => 'rest_products' ) as $route => $cb ) {
			register_rest_route(
				self::REST_NS,
				'/' . $route,
				array( 'methods' => 'GET', 'callback' => array( __CLASS__, $cb ), 'permission_callback' => '__return_true' )
			);
		}
		// Storefront photo search: small product images for the similarity model.
		register_rest_route(
			self::REST_NS,
			'/thumbs',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'rest_thumbs' ),
				'permission_callback' => '__return_true',
				'args'                => array( 'ids' => array( 'required' => true ) ),
			)
		);
	}

	/** GET /thumbs?ids=1,2,3 -> { "1": "<medium-size url>", ... } */
	public static function rest_thumbs( WP_REST_Request $req ) {
		$ids = array_slice( array_filter( array_map( 'absint', explode( ',', (string) $req->get_param( 'ids' ) ) ) ), 0, 100 );
		$out = array();
		foreach ( $ids as $id ) {
			$thumb_id = get_post_thumbnail_id( $id );
			$url      = $thumb_id ? wp_get_attachment_image_url( $thumb_id, 'medium' ) : '';
			if ( $url ) {
				$out[ (string) $id ] = $url;
			}
		}
		$response = new WP_REST_Response( $out );
		$response->header( 'Cache-Control', 'public, max-age=3600' );
		return $response;
	}

	/**
	 * The storefront analyses product images in the browser (photo search).
	 * Browsers only allow that when the image is same-origin or served with a
	 * CORS header, so make sure uploads carry one. Runs once per plugin version.
	 */
	public static function ensure_uploads_cors() {
		if ( get_option( 'kayals_hp_cors_version' ) === self::VERSION ) {
			return;
		}
		$upload = wp_upload_dir();
		$file   = trailingslashit( $upload['basedir'] ) . '.htaccess';
		$block = <<<'HTACCESS'
# BEGIN Kayals Homepage Builder (CORS for storefront photo search)
<IfModule mod_headers.c>
  <FilesMatch "\.(jpe?g|png|gif|webp|avif)$">
    Header set Access-Control-Allow-Origin "*"
  </FilesMatch>
</IfModule>
# END Kayals Homepage Builder

HTACCESS;
		$existing = file_exists( $file ) ? (string) file_get_contents( $file ) : '';
		if ( false === strpos( $existing, 'BEGIN Kayals Homepage Builder' ) ) {
			$sep = ( '' !== $existing && PHP_EOL !== substr( $existing, -1 ) ) ? PHP_EOL : '';
			@file_put_contents( $file, $existing . $sep . $block );
		}
		update_option( 'kayals_hp_cors_version', self::VERSION, false );
	}

	/**
	 * Our REST routes are public and never use cookies, and /homepage is sent
	 * with a public Cache-Control so the CDN caches it. WordPress core echoes
	 * the *requesting* origin into Access-Control-Allow-Origin, which the CDN
	 * then caches and serves to every other origin (www vs non-www, localhost)
	 * — and the browser blocks the response. Send a wildcard instead, and
	 * mark the response as varying by Origin for any cache that respects it.
	 *
	 * Runs after core's rest_send_cors_headers (priority 10) so ours wins.
	 */
	public static function rest_cors_headers( $served, $result, $request ) {
		if ( $request instanceof WP_REST_Request && 0 === strpos( $request->get_route(), '/' . self::REST_NS . '/' ) ) {
			header( 'Access-Control-Allow-Origin: *' );
			header_remove( 'Access-Control-Allow-Credentials' );
			header( 'Vary: Origin', false );
		}
		return $served;
	}

	public static function rest_homepage() {
		$payload = get_transient( self::TRANSIENT );
		if ( false === $payload ) {
			$payload = self::build_public_payload();
			set_transient( self::TRANSIENT, $payload, 5 * MINUTE_IN_SECONDS );
		}
		$response = new WP_REST_Response( $payload );
		$response->header( 'Cache-Control', 'public, max-age=60' );
		return $response;
	}

	/**
	 * Resolve the saved config into what the storefront needs: category IDs
	 * become category objects, product rails become ordered product-ID lists
	 * (the storefront already has a rich product transformer; we just tell it
	 * which IDs, in what order).
	 */
	private static function build_public_payload() {
		$config   = self::get_config();
		$sections = array();

		foreach ( $config['sections'] as $s ) {
			if ( empty( $s['enabled'] ) ) {
				continue;
			}
			$pub = array(
				'id'    => $s['id'],
				'type'  => $s['type'],
				'title' => $s['title'],
			);

			switch ( $s['type'] ) {
				case 'category_strip':
					$pub['categories'] = self::resolve_categories( $s['items'], true );
					break;

				case 'category_tabs':
					$pub['categories'] = self::resolve_categories( $s['items'], false );
					break;

				case 'hero':
				case 'reels':
				case 'reviews':
					$pub['items'] = $s['items'];
					break;

				case 'story':
					foreach ( array( 'subtitle', 'image', 'image_alt', 'name', 'role', 'intro', 'more', 'read_more', 'read_less' ) as $field ) {
						$pub[ $field ] = $s[ $field ] ?? '';
					}
					break;

				case 'products':
					$ids                = self::resolve_product_ids( $s );
					$pub['emoji']       = $s['emoji'];
					$pub['layout']      = $s['layout'];
					$pub['product_ids'] = $ids;
					$pub['products']    = self::product_cards( $ids );
					$pub['view_all']    = self::resolve_view_all( $s );
					break;
			}
			$sections[] = $pub;
		}

		$topbar = $config['topbar'];
		foreach ( $topbar['items'] as &$item ) {
			// Ready-made wa.me link so the storefront doesn't have to parse the number.
			$digits      = preg_replace( '/\D+/', '', $item['phone'] );
			$item['url'] = 'whatsapp' === $item['type'] && $digits ? 'https://wa.me/' . $digits : $item['link'];
		}
		unset( $item );

		return array(
			'version'   => self::VERSION,
			'generated' => gmdate( 'c' ),
			// Disabled sections are dropped above, so their absence alone cannot
			// tell the storefront whether a type is switched off or simply not
			// supported by this version. This says which types we own, so the
			// storefront knows when to stop using its own built-in copy.
			'manages'   => array_values( self::TYPES ),
			'topbar'    => $topbar,
			'sections'  => $sections,
		);
	}

	/**
	 * Empty list = "every category" so an untouched section keeps today's
	 * behaviour: the strip shows top-level categories, the tabs show all of them.
	 */
	private static function resolve_categories( $ids, $top_level_only ) {
		if ( empty( $ids ) ) {
			$args = array( 'taxonomy' => 'product_cat', 'hide_empty' => true, 'orderby' => 'menu_order', 'order' => 'ASC' );
			if ( $top_level_only ) {
				$args['parent'] = 0;
			}
			$terms = get_terms( $args );
			$terms = is_wp_error( $terms ) ? array() : $terms;
		} else {
			$terms = array();
			foreach ( $ids as $id ) {
				$t = get_term( $id, 'product_cat' );
				if ( $t && ! is_wp_error( $t ) ) {
					$terms[] = $t;
				}
			}
		}
		$out = array();
		foreach ( $terms as $t ) {
			if ( in_array( $t->slug, array( 'uncategorized', 'all-products' ), true ) ) {
				continue;
			}
			$thumb_id = (int) get_term_meta( $t->term_id, 'thumbnail_id', true );
			$out[]    = array(
				'id'       => (string) $t->term_id,
				'name'     => $t->name,
				'slug'     => $t->slug,
				'image'    => $thumb_id ? wp_get_attachment_image_url( $thumb_id, 'medium' ) : '',
				'count'    => (int) $t->count,
				'parentId' => $t->parent ? (string) $t->parent : null,
			);
		}
		return $out;
	}

	private static function resolve_product_ids( $s ) {
		$limit = (int) $s['limit'];

		$newest = array( 'status' => 'publish', 'limit' => $limit, 'orderby' => 'date', 'order' => 'DESC', 'return' => 'ids' );

		if ( 'manual' === $s['source'] ) {
			// Nothing curated yet → newest products, so the rail is never empty.
			if ( empty( $s['products'] ) ) {
				return array_map( 'intval', wc_get_products( $newest ) );
			}
			// Every picked product shows (the limit only caps automatic lists);
			// drop anything unpublished but keep the admin's order.
			$live = wc_get_products( array( 'include' => $s['products'], 'status' => 'publish', 'limit' => -1, 'return' => 'ids' ) );
			$live = array_flip( $live );
			$ids  = array();
			foreach ( $s['products'] as $id ) {
				if ( isset( $live[ $id ] ) ) {
					$ids[] = (int) $id;
				}
			}
			return $ids;
		}

		// Category source. No category chosen yet → newest products as well.
		$term = get_term( $s['category'], 'product_cat' );
		if ( ! $term || is_wp_error( $term ) ) {
			return array_map( 'intval', wc_get_products( $newest ) );
		}
		return array_map(
			'intval',
			wc_get_products(
				array(
					'status'   => 'publish',
					'limit'    => $limit,
					'orderby'  => 'menu_order title',
					'order'    => 'ASC',
					'return'   => 'ids',
					'category' => array( $term->slug ),
				)
			)
		);
	}

	/**
	 * Product cards in the storefront's own `Product` shape (the fast "list"
	 * variant its woocommerce-products function produces), in the given order.
	 * Shipping them here means a rail is one request and never depends on the
	 * Supabase function knowing about ID ordering.
	 */
	private static function product_cards( $ids ) {
		if ( empty( $ids ) ) {
			return array();
		}
		$products = wc_get_products( array( 'include' => $ids, 'status' => 'publish', 'limit' => -1 ) );
		$by_id    = array();
		foreach ( $products as $p ) {
			$by_id[ $p->get_id() ] = $p;
		}
		$cards = array();
		foreach ( $ids as $id ) {
			if ( isset( $by_id[ $id ] ) ) {
				$cards[] = self::product_card( $by_id[ $id ] );
			}
		}
		return $cards;
	}

	private static function product_card( WC_Product $p ) {
		$images = array();
		foreach ( array_merge( array( $p->get_image_id() ), $p->get_gallery_image_ids() ) as $img_id ) {
			$url = $img_id ? wp_get_attachment_image_url( $img_id, 'full' ) : '';
			if ( $url ) {
				$images[] = $url;
			}
		}

		$colors = array();
		$sizes  = array();
		foreach ( $p->get_attributes() as $attr ) {
			$label = strtolower( wc_attribute_label( $attr->get_name(), $p ) );
			if ( $attr->is_taxonomy() ) {
				$terms = $attr->get_terms();
				$opts  = $terms ? wp_list_pluck( $terms, 'name' ) : array();
			} else {
				$opts = $attr->get_options();
			}
			if ( in_array( $label, array( 'color', 'colour' ), true ) ) {
				$colors = array_values( $opts );
			} elseif ( 'size' === $label ) {
				$sizes = array_values( $opts );
			}
		}

		// One image per colour, so the card's swatches show the actual variation
		// photo (the storefront's woocommerce-products list path does the same).
		$variation_images = array();
		if ( $p->is_type( 'variable' ) ) {
			foreach ( $p->get_children() as $vid ) {
				$v = wc_get_product( $vid );
				if ( ! $v ) {
					continue;
				}
				$color = '';
				foreach ( $v->get_attributes() as $attr_key => $val ) {
					$label = strtolower( wc_attribute_label( $attr_key, $v ) );
					if ( in_array( $label, array( 'color', 'colour' ), true ) ) {
						if ( taxonomy_exists( $attr_key ) ) {
							$term  = get_term_by( 'slug', $val, $attr_key );
							$color = $term ? $term->name : $val;
						} else {
							$color = $val;
						}
						break;
					}
				}
				$color = trim( (string) $color );
				if ( '' === $color ) {
					$color = 'Default';
				}
				if ( isset( $variation_images[ $color ] ) ) {
					continue;
				}
				// 'edit' context = the variation's own image only, not the parent's fallback.
				$img_id = $v->get_image_id( 'edit' );
				$url    = $img_id ? wp_get_attachment_image_url( $img_id, 'full' ) : '';
				if ( $url ) {
					$variation_images[ $color ] = $url;
				}
			}
		}
		$variation_list = array();
		foreach ( $variation_images as $color => $url ) {
			$variation_list[] = array( 'color' => $color, 'images' => array( $url ) );
		}

		$cat_ids = $p->get_category_ids();
		$cat     = ! empty( $cat_ids ) ? get_term( $cat_ids[0], 'product_cat' ) : null;
		$cat     = ( $cat && ! is_wp_error( $cat ) ) ? $cat : null;

		$price   = (float) $p->get_price();
		$regular = (float) $p->get_regular_price();
		$on_sale = $p->is_on_sale() && $regular > 0;

		return array(
			'id'               => (string) $p->get_id(),
			'name'             => $p->get_name(),
			'slug'             => $p->get_slug(),
			'price'            => $price,
			'originalPrice'    => $regular > 0 ? $regular : null,
			'discount'         => $on_sale ? (int) round( ( $regular - $price ) / $regular * 100 ) : null,
			'images'           => $images,
			'variationImages'  => $variation_list ? $variation_list : null,
			'colors'           => $colors,
			'sizes'            => $sizes,
			'category'         => $cat ? $cat->name : 'Uncategorized',
			'categorySlug'     => $cat ? $cat->slug : 'uncategorized',
			'categoryId'       => $cat ? (string) $cat->term_id : '',
			'isNew'            => $p->is_featured(),
			'isSoldOut'        => 'outofstock' === $p->get_stock_status(),
			'inStock'          => 'instock' === $p->get_stock_status(),
			'stockQuantity'    => $p->get_stock_quantity(),
			'description'      => $p->get_description(),
			'shortDescription' => $p->get_short_description(),
			'sku'              => $p->get_sku(),
			'type'             => $p->get_type(),
			'averageRating'    => $p->get_average_rating(),
			'ratingCount'      => $p->get_rating_count(),
		);
	}

	private static function resolve_view_all( $s ) {
		if ( ! empty( $s['view_all'] ) ) {
			return $s['view_all'];
		}
		if ( 'category' === $s['source'] ) {
			$term = get_term( $s['category'], 'product_cat' );
			if ( $term && ! is_wp_error( $term ) ) {
				return '/collections/' . $term->slug;
			}
		}
		return '';
	}
}

Kayals_Homepage::init();

// Public WordPress URLs → storefront / admin (see the file for the rules).
require_once __DIR__ . '/redirects.php';
