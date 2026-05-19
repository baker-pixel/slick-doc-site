<?php
/**
 * Plugin Name: OrangeDoor SEO Connect
 * Plugin URI:  https://orangedoor.marketing
 * Description: Connects your WordPress site to OrangeDoor's AI SEO agent so fixes can be applied automatically.
 * Version:     1.0.0
 * Author:      OrangeDoor Marketing
 * License:     GPL-2.0-or-later
 * Text Domain: orangedoor
 */

defined( 'ABSPATH' ) || exit;

define( 'OD_VERSION',    '1.0.0' );
define( 'OD_OPTION_KEY', 'orangedoor_api_key' );
define( 'OD_NS',         'orangedoor/v1' );

// ── Activation / Deactivation ────────────────────────────────────────────────

register_activation_hook( __FILE__, 'od_activate' );
function od_activate() {
    if ( ! get_option( OD_OPTION_KEY ) ) {
        update_option( OD_OPTION_KEY, od_generate_key() );
    }
}

register_deactivation_hook( __FILE__, 'od_deactivate' );
function od_deactivate() {
    // Key is intentionally kept so reconnection is seamless.
}

function od_generate_key(): string {
    return 'od_' . bin2hex( random_bytes( 24 ) );
}

// ── REST API ─────────────────────────────────────────────────────────────────

add_action( 'rest_api_init', 'od_register_routes' );
function od_register_routes() {
    register_rest_route( OD_NS, '/status', [
        'methods'             => 'GET',
        'callback'            => 'od_status',
        'permission_callback' => 'od_check_api_key',
    ] );

    register_rest_route( OD_NS, '/apply-fixes', [
        'methods'             => 'POST',
        'callback'            => 'od_apply_fixes',
        'permission_callback' => 'od_check_api_key',
        'args'                => [
            'fixes' => [
                'required' => true,
                'type'     => 'array',
            ],
        ],
    ] );
}

function od_check_api_key( WP_REST_Request $request ): bool {
    $stored = get_option( OD_OPTION_KEY );
    if ( ! $stored ) return false;

    $provided = $request->get_header( 'X-OD-API-Key' )
             ?? $request->get_param( 'api_key' );

    return hash_equals( $stored, (string) $provided );
}

// ── Status endpoint ──────────────────────────────────────────────────────────

function od_status(): WP_REST_Response {
    return new WP_REST_Response( [
        'connected'         => true,
        'version'           => OD_VERSION,
        'site_url'          => get_site_url(),
        'active_seo_plugin' => od_detect_seo_plugin(),
        'wordpress_version' => get_bloginfo( 'version' ),
    ] );
}

function od_detect_seo_plugin(): string {
    if ( defined( 'WPSEO_VERSION' ) || class_exists( 'WPSEO_Frontend' ) ) return 'yoast';
    if ( class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ) )   return 'rankmath';
    if ( class_exists( 'AIOSEO\Plugin\AIOSEO' ) )                          return 'aioseo';
    return 'none';
}

// ── Apply fixes endpoint ─────────────────────────────────────────────────────

function od_apply_fixes( WP_REST_Request $request ): WP_REST_Response {
    $fixes   = $request->get_param( 'fixes' );
    $results = [];

    foreach ( (array) $fixes as $fix ) {
        $type      = sanitize_text_field( $fix['type']      ?? '' );
        $value     = wp_kses_post(        $fix['value']     ?? '' );
        $post_url  = esc_url_raw(         $fix['post_url']  ?? '' );
        $image_src = esc_url_raw(         $fix['image_src'] ?? '' );
        $fix_id    = sanitize_text_field( $fix['fix_id']    ?? '' );

        $result = od_apply_single_fix( $type, $value, $post_url, $image_src );
        $results[] = array_merge( [ 'fix_id' => $fix_id, 'type' => $type ], $result );
    }

    return new WP_REST_Response( [ 'results' => $results ] );
}

function od_apply_single_fix( string $type, string $value, string $post_url, string $image_src ): array {
    switch ( $type ) {
        case 'wp_meta_title':
            return od_fix_meta_title( $value, $post_url );

        case 'wp_meta_description':
            return od_fix_meta_description( $value, $post_url );

        case 'wp_og_title':
            return od_fix_og_title( $value, $post_url );

        case 'wp_og_description':
            return od_fix_og_description( $value, $post_url );

        case 'wp_canonical':
            return od_fix_canonical( $value, $post_url );

        case 'wp_image_alt':
            return od_fix_image_alt( $value, $image_src );

        case 'wp_schema':
            return od_fix_schema( $value, $post_url );

        default:
            return [ 'success' => false, 'error' => "Unsupported fix type: $type" ];
    }
}

// ── Fix: meta title ──────────────────────────────────────────────────────────

function od_fix_meta_title( string $value, string $post_url ): array {
    $post = od_find_post( $post_url );
    if ( ! $post ) return [ 'success' => false, 'error' => 'Post/page not found' ];

    $before = get_the_title( $post->ID );
    $seo    = od_detect_seo_plugin();

    if ( $seo === 'yoast' ) {
        update_post_meta( $post->ID, '_yoast_wpseo_title', $value );
    } elseif ( $seo === 'rankmath' ) {
        update_post_meta( $post->ID, 'rank_math_title', $value );
    } elseif ( $seo === 'aioseo' ) {
        od_aioseo_update( $post->ID, 'title', $value );
    } else {
        // Fallback: update OD custom field; wp_head hook outputs it
        update_post_meta( $post->ID, '_od_meta_title', $value );
    }

    return [ 'success' => true, 'before' => $before, 'after' => $value ];
}

// ── Fix: meta description ────────────────────────────────────────────────────

function od_fix_meta_description( string $value, string $post_url ): array {
    $post = od_find_post( $post_url );
    if ( ! $post ) return [ 'success' => false, 'error' => 'Post/page not found' ];

    $seo = od_detect_seo_plugin();
    $before = '';

    if ( $seo === 'yoast' ) {
        $before = get_post_meta( $post->ID, '_yoast_wpseo_metadesc', true );
        update_post_meta( $post->ID, '_yoast_wpseo_metadesc', $value );
    } elseif ( $seo === 'rankmath' ) {
        $before = get_post_meta( $post->ID, 'rank_math_description', true );
        update_post_meta( $post->ID, 'rank_math_description', $value );
    } elseif ( $seo === 'aioseo' ) {
        $before = od_aioseo_get( $post->ID, 'description' );
        od_aioseo_update( $post->ID, 'description', $value );
    } else {
        $before = get_post_meta( $post->ID, '_od_meta_description', true );
        update_post_meta( $post->ID, '_od_meta_description', $value );
    }

    return [ 'success' => true, 'before' => $before, 'after' => $value ];
}

// ── Fix: OG title ────────────────────────────────────────────────────────────

function od_fix_og_title( string $value, string $post_url ): array {
    $post = od_find_post( $post_url );
    if ( ! $post ) return [ 'success' => false, 'error' => 'Post/page not found' ];

    $seo = od_detect_seo_plugin();

    if ( $seo === 'yoast' ) {
        update_post_meta( $post->ID, '_yoast_wpseo_opengraph-title', $value );
    } elseif ( $seo === 'rankmath' ) {
        update_post_meta( $post->ID, 'rank_math_facebook_title', $value );
    } else {
        update_post_meta( $post->ID, '_od_og_title', $value );
    }

    return [ 'success' => true, 'after' => $value ];
}

// ── Fix: OG description ──────────────────────────────────────────────────────

function od_fix_og_description( string $value, string $post_url ): array {
    $post = od_find_post( $post_url );
    if ( ! $post ) return [ 'success' => false, 'error' => 'Post/page not found' ];

    $seo = od_detect_seo_plugin();

    if ( $seo === 'yoast' ) {
        update_post_meta( $post->ID, '_yoast_wpseo_opengraph-description', $value );
    } elseif ( $seo === 'rankmath' ) {
        update_post_meta( $post->ID, 'rank_math_facebook_description', $value );
    } else {
        update_post_meta( $post->ID, '_od_og_description', $value );
    }

    return [ 'success' => true, 'after' => $value ];
}

// ── Fix: canonical ───────────────────────────────────────────────────────────

function od_fix_canonical( string $value, string $post_url ): array {
    $post = od_find_post( $post_url );
    if ( ! $post ) return [ 'success' => false, 'error' => 'Post/page not found' ];

    $seo = od_detect_seo_plugin();

    if ( $seo === 'yoast' ) {
        update_post_meta( $post->ID, '_yoast_wpseo_canonical', $value );
    } elseif ( $seo === 'rankmath' ) {
        update_post_meta( $post->ID, 'rank_math_canonical_url', $value );
    } else {
        update_post_meta( $post->ID, '_od_canonical', $value );
    }

    return [ 'success' => true, 'after' => $value ];
}

// ── Fix: image alt text ──────────────────────────────────────────────────────

function od_fix_image_alt( string $value, string $image_src ): array {
    if ( ! $image_src ) return [ 'success' => false, 'error' => 'image_src required for alt text fix' ];

    // Find attachment by file URL
    global $wpdb;
    $filename   = basename( parse_url( $image_src, PHP_URL_PATH ) );
    $attachment = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT ID FROM $wpdb->posts WHERE post_type='attachment' AND guid LIKE %s LIMIT 5",
            '%' . $wpdb->esc_like( $filename ) . '%'
        )
    );

    if ( empty( $attachment ) ) return [ 'success' => false, 'error' => 'Image not found in media library' ];

    $id     = (int) $attachment[0];
    $before = get_post_meta( $id, '_wp_attachment_image_alt', true );
    update_post_meta( $id, '_wp_attachment_image_alt', $value );

    return [ 'success' => true, 'before' => $before, 'after' => $value ];
}

// ── Fix: JSON-LD schema ──────────────────────────────────────────────────────

function od_fix_schema( string $value, string $post_url ): array {
    $post = od_find_post( $post_url );
    if ( ! $post ) return [ 'success' => false, 'error' => 'Post/page not found' ];

    // Validate JSON
    json_decode( $value );
    if ( json_last_error() !== JSON_ERROR_NONE ) {
        return [ 'success' => false, 'error' => 'Invalid JSON for schema' ];
    }

    update_post_meta( $post->ID, '_od_schema_json', $value );
    return [ 'success' => true, 'after' => 'Schema JSON stored' ];
}

// ── AIOSEO helpers ───────────────────────────────────────────────────────────

function od_aioseo_update( int $post_id, string $field, string $value ): void {
    global $wpdb;
    $table = $wpdb->prefix . 'aioseo_posts';
    if ( $wpdb->get_var( "SHOW TABLES LIKE '$table'" ) !== $table ) return;

    $exists = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $table WHERE post_id = %d", $post_id ) );
    if ( $exists ) {
        $wpdb->update( $table, [ $field => $value ], [ 'post_id' => $post_id ] );
    } else {
        $wpdb->insert( $table, [ 'post_id' => $post_id, $field => $value ] );
    }
}

function od_aioseo_get( int $post_id, string $field ): string {
    global $wpdb;
    $table = $wpdb->prefix . 'aioseo_posts';
    if ( $wpdb->get_var( "SHOW TABLES LIKE '$table'" ) !== $table ) return '';
    return (string) $wpdb->get_var( $wpdb->prepare( "SELECT `$field` FROM $table WHERE post_id = %d", $post_id ) );
}

// ── Post lookup ──────────────────────────────────────────────────────────────

function od_find_post( string $url ): ?WP_Post {
    if ( ! $url ) return null;

    // Try by URL → post ID
    $post_id = url_to_postid( $url );
    if ( $post_id ) {
        $post = get_post( $post_id );
        if ( $post ) return $post;
    }

    // Try by slug
    $slug   = rtrim( parse_url( $url, PHP_URL_PATH ), '/' );
    $slug   = basename( $slug );
    $search = get_posts( [
        'name'        => $slug,
        'post_type'   => [ 'post', 'page' ],
        'post_status' => 'publish',
        'numberposts' => 1,
    ] );

    return $search[0] ?? null;
}

// ── wp_head fallback output (when no SEO plugin installed) ───────────────────

add_action( 'wp_head', 'od_output_custom_meta', 1 );
function od_output_custom_meta() {
    if ( ! is_singular() ) return;
    $post_id = get_the_ID();
    if ( ! $post_id ) return;

    // Only output if no SEO plugin is active (they handle their own output)
    if ( od_detect_seo_plugin() !== 'none' ) return;

    $title = get_post_meta( $post_id, '_od_meta_title', true );
    $desc  = get_post_meta( $post_id, '_od_meta_description', true );
    $og_t  = get_post_meta( $post_id, '_od_og_title', true );
    $og_d  = get_post_meta( $post_id, '_od_og_description', true );
    $canon = get_post_meta( $post_id, '_od_canonical', true );
    $schem = get_post_meta( $post_id, '_od_schema_json', true );

    if ( $title ) echo '<title>' . esc_html( $title ) . "</title>\n";
    if ( $desc )  echo '<meta name="description" content="' . esc_attr( $desc ) . "\">\n";
    if ( $og_t )  echo '<meta property="og:title" content="' . esc_attr( $og_t ) . "\">\n";
    if ( $og_d )  echo '<meta property="og:description" content="' . esc_attr( $og_d ) . "\">\n";
    if ( $canon ) echo '<link rel="canonical" href="' . esc_url( $canon ) . "\">\n";
    if ( $schem ) echo '<script type="application/ld+json">' . wp_json_encode( json_decode( $schem ) ) . "</script>\n";
}

// ── Admin settings page ──────────────────────────────────────────────────────

add_action( 'admin_menu', 'od_add_settings_page' );
function od_add_settings_page() {
    add_options_page(
        'OrangeDoor SEO Connect',
        'OrangeDoor',
        'manage_options',
        'orangedoor',
        'od_render_settings_page'
    );
}

add_action( 'admin_init', 'od_settings_init' );
function od_settings_init() {
    register_setting( 'orangedoor', OD_OPTION_KEY );

    if ( isset( $_POST['od_regenerate_key'] ) && check_admin_referer( 'od_regenerate' ) ) {
        update_option( OD_OPTION_KEY, od_generate_key() );
        wp_safe_redirect( admin_url( 'options-general.php?page=orangedoor&regenerated=1' ) );
        exit;
    }
}

function od_render_settings_page() {
    $api_key  = get_option( OD_OPTION_KEY, '' );
    $site_url = get_site_url();
    $seo_plug = od_detect_seo_plugin();
    $seo_label = [
        'yoast'    => 'Yoast SEO (detected)',
        'rankmath' => 'RankMath (detected)',
        'aioseo'   => 'All-in-One SEO (detected)',
        'none'     => 'None — OrangeDoor will output meta tags directly',
    ][ $seo_plug ];
    ?>
    <div class="wrap">
        <h1>OrangeDoor SEO Connect</h1>

        <?php if ( isset( $_GET['regenerated'] ) ) : ?>
            <div class="notice notice-success is-dismissible"><p>API key regenerated. Update your OrangeDoor dashboard.</p></div>
        <?php endif; ?>

        <div style="background:#fff;border:1px solid #ccd0d4;border-radius:4px;padding:24px;max-width:700px;margin-top:20px;">
            <h2 style="margin-top:0">Connection Details</h2>
            <p>Paste these into <strong>Settings → WordPress Integration</strong> in your OrangeDoor dashboard.</p>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">Site URL</th>
                    <td>
                        <code style="font-size:14px;background:#f0f0f1;padding:4px 8px;border-radius:3px"><?php echo esc_html( $site_url ); ?></code>
                        <button type="button" class="button button-small" onclick="navigator.clipboard.writeText('<?php echo esc_js( $site_url ); ?>');this.textContent='Copied!';" style="margin-left:8px">Copy</button>
                    </td>
                </tr>
                <tr>
                    <th scope="row">API Key</th>
                    <td>
                        <input type="text" readonly value="<?php echo esc_attr( $api_key ); ?>"
                               style="width:100%;max-width:420px;font-family:monospace;font-size:13px"
                               onfocus="this.select()" />
                        <button type="button" class="button button-small" onclick="navigator.clipboard.writeText('<?php echo esc_js( $api_key ); ?>');this.textContent='Copied!';" style="margin-left:8px">Copy</button>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Active SEO Plugin</th>
                    <td><?php echo esc_html( $seo_label ); ?></td>
                </tr>
            </table>

            <hr style="margin:24px 0">

            <h3>Regenerate API Key</h3>
            <p style="color:#646970">Only do this if your key was compromised. You'll need to update the OrangeDoor dashboard with the new key.</p>
            <form method="post">
                <?php wp_nonce_field( 'od_regenerate' ); ?>
                <input type="hidden" name="od_regenerate_key" value="1">
                <button type="submit" class="button button-secondary"
                        onclick="return confirm('Regenerate API key? The old key will stop working immediately.')">
                    Regenerate Key
                </button>
            </form>
        </div>

        <div style="background:#fff;border:1px solid #ccd0d4;border-radius:4px;padding:24px;max-width:700px;margin-top:20px;">
            <h2 style="margin-top:0">About this Plugin</h2>
            <p>This plugin lets OrangeDoor's AI SEO agent apply fixes (meta titles, descriptions, OG tags, image alt text, canonical URLs, and JSON-LD schema) directly to your WordPress site — without sharing your admin credentials.</p>
            <p>Supported SEO plugins: <strong>Yoast SEO</strong>, <strong>RankMath</strong>, <strong>All-in-One SEO</strong>. When none are active, tags are output via <code>wp_head</code>.</p>
            <p>All fix requests are authenticated via your API key. Changes are visible immediately on your live site.</p>
        </div>
    </div>
    <?php
}
