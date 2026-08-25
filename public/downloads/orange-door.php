<?php
/**
 * Plugin Name: Orange Door SEO
 * Description: Connects your WordPress site to Orange Door for automated SEO auditing and fixes.
 * Version: 1.0.0
 * Author: Orange Door
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ─────────────────────────────────────────────
// 1. ACTIVATION — generate token + ping OD backend
// ─────────────────────────────────────────────

register_activation_hook( __FILE__, 'od_activate' );

function od_activate() {
    $token = get_option( 'od_secret_token' );
    if ( ! $token ) {
        $token = 'od_' . wp_generate_password( 32, false );
        update_option( 'od_secret_token', $token );
    }

    $backend_url = 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/connect-site';

    wp_remote_post( $backend_url, [
        'body'    => json_encode([
            'site_url'    => get_site_url(),
            'token'       => $token,
            'wp_version'  => get_bloginfo( 'version' ),
            'plugins'     => od_get_active_seo_plugins(),
        ]),
        'headers' => [ 'Content-Type' => 'application/json' ],
        'timeout' => 10,
    ]);
}

function od_get_active_seo_plugins() {
    $seo_plugins = [];
    if ( defined( 'WPSEO_VERSION' ) )     $seo_plugins[] = 'yoast-seo';
    if ( defined( 'RANK_MATH_VERSION' ) ) $seo_plugins[] = 'rank-math';
    if ( class_exists( 'AIOSEO\Plugin\AIOSEO' ) ) $seo_plugins[] = 'aioseo';
    return $seo_plugins;
}


// ─────────────────────────────────────────────
// 2. REGISTER ALL CUSTOM REST ENDPOINTS
// ─────────────────────────────────────────────

add_action( 'rest_api_init', 'od_register_routes' );

function od_register_routes() {

    // Health check
    register_rest_route( 'orangedoor/v1', '/ping', [
        'methods'             => 'GET',
        'callback'            => 'od_ping',
        'permission_callback' => 'od_verify_token',
    ]);

    // Full site scan — returns all posts, pages, media with SEO state
    register_rest_route( 'orangedoor/v1', '/scan', [
        'methods'             => 'GET',
        'callback'            => 'od_scan',
        'permission_callback' => 'od_verify_token',
    ]);

    // Apply approved fixes
    register_rest_route( 'orangedoor/v1', '/apply', [
        'methods'             => 'POST',
        'callback'            => 'od_apply',
        'permission_callback' => 'od_verify_token',
    ]);

    // Verify a fix saved correctly
    register_rest_route( 'orangedoor/v1', '/verify/(?P<id>\d+)', [
        'methods'             => 'GET',
        'callback'            => 'od_verify',
        'permission_callback' => 'od_verify_token',
        'args'                => [
            'id' => [ 'validate_callback' => function( $p ) { return is_numeric( $p ); } ],
        ],
    ]);
}


// ─────────────────────────────────────────────
// 3. TOKEN AUTHENTICATION
// ─────────────────────────────────────────────

function od_verify_token( WP_REST_Request $request ) {
    $incoming = $request->get_header( 'X-OD-Token' );
    $stored   = get_option( 'od_secret_token' );

    if ( ! $incoming || ! $stored ) {
        return new WP_Error( 'od_no_token', 'Token missing.', [ 'status' => 401 ] );
    }

    if ( ! hash_equals( $stored, $incoming ) ) {
        return new WP_Error( 'od_bad_token', 'Invalid token.', [ 'status' => 401 ] );
    }

    return true;
}


// ─────────────────────────────────────────────
// 4. PING ENDPOINT
// ─────────────────────────────────────────────

function od_ping() {
    return rest_ensure_response([
        'status'         => 'ok',
        'site_url'       => get_site_url(),
        'plugin_version' => '1.0.0',
        'wp_version'     => get_bloginfo( 'version' ),
        'yoast_active'   => defined( 'WPSEO_VERSION' ),
        'rankmath_active'=> defined( 'RANK_MATH_VERSION' ),
    ]);
}


// ─────────────────────────────────────────────
// 5. SCAN ENDPOINT — full site SEO state
// ─────────────────────────────────────────────

function od_scan() {
    $data = [
        'site_url'  => get_site_url(),
        'scanned_at'=> current_time( 'c' ),
        'posts'     => [],
        'pages'     => [],
        'media'     => [],
        'sitemap'   => od_get_sitemap_info(),
    ];

    $posts = get_posts([
        'post_type'      => 'post',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
    ]);
    foreach ( $posts as $post ) {
        $data['posts'][] = od_build_post_data( $post );
    }

    $pages = get_posts([
        'post_type'      => 'page',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
    ]);
    foreach ( $pages as $page ) {
        $data['pages'][] = od_build_post_data( $page );
    }

    $media_items = get_posts([
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'posts_per_page' => -1,
    ]);
    foreach ( $media_items as $media ) {
        $alt = get_post_meta( $media->ID, '_wp_attachment_image_alt', true );
        $data['media'][] = [
            'id'          => $media->ID,
            'url'         => wp_get_attachment_url( $media->ID ),
            'filename'    => basename( get_attached_file( $media->ID ) ),
            'alt_text'    => $alt ?: '',
            'missing_alt' => empty( $alt ),
        ];
    }

    return rest_ensure_response( $data );
}

function od_build_post_data( $post ) {
    $meta_title   = '';
    $meta_desc    = '';
    $focus_kw     = '';
    $canonical    = '';

    if ( defined( 'WPSEO_VERSION' ) ) {
        $meta_title = get_post_meta( $post->ID, '_yoast_wpseo_title', true ) ?: '';
        $meta_desc  = get_post_meta( $post->ID, '_yoast_wpseo_metadesc', true ) ?: '';
        $focus_kw   = get_post_meta( $post->ID, '_yoast_wpseo_focuskw', true ) ?: '';
        $canonical  = get_post_meta( $post->ID, '_yoast_wpseo_canonical', true ) ?: '';
    }

    if ( defined( 'RANK_MATH_VERSION' ) ) {
        $meta_title = $meta_title ?: get_post_meta( $post->ID, 'rank_math_title', true ) ?: '';
        $meta_desc  = $meta_desc  ?: get_post_meta( $post->ID, 'rank_math_description', true ) ?: '';
        $focus_kw   = $focus_kw   ?: get_post_meta( $post->ID, 'rank_math_focus_keyword', true ) ?: '';
    }

    preg_match_all( '/<h1[^>]*>/i', $post->post_content, $h1_matches );
    $h1_count = count( $h1_matches[0] );

    preg_match_all( '/<a[^>]+href=["\']' . preg_quote( get_site_url(), '/' ) . '[^"\']*["\'][^>]*>/i', $post->post_content, $link_matches );
    $internal_links = count( $link_matches[0] );

    $word_count = str_word_count( wp_strip_all_tags( $post->post_content ) );

    $images = [];
    $attached = get_attached_media( 'image', $post->ID );
    foreach ( $attached as $img ) {
        $alt = get_post_meta( $img->ID, '_wp_attachment_image_alt', true );
        $images[] = [
            'id'          => $img->ID,
            'url'         => wp_get_attachment_url( $img->ID ),
            'alt_text'    => $alt ?: '',
            'missing_alt' => empty( $alt ),
        ];
    }

    return [
        'id'             => $post->ID,
        'type'           => $post->post_type,
        'title'          => $post->post_title,
        'slug'           => $post->post_name,
        'url'            => get_permalink( $post->ID ),
        'meta_title'     => $meta_title,
        'meta_desc'      => $meta_desc,
        'focus_keyword'  => $focus_kw,
        'canonical'      => $canonical,
        'h1_count'       => $h1_count,
        'word_count'     => $word_count,
        'internal_links' => $internal_links,
        'modified'       => $post->post_modified,
        'images'         => $images,
        'issues'         => od_detect_issues([
            'meta_title'    => $meta_title,
            'meta_desc'     => $meta_desc,
            'focus_keyword' => $focus_kw,
            'h1_count'      => $h1_count,
            'word_count'    => $word_count,
        ]),
    ];
}

function od_detect_issues( $data ) {
    $issues = [];

    if ( empty( $data['meta_title'] ) )
        $issues[] = [ 'field' => 'meta_title', 'severity' => 'error', 'message' => 'Missing meta title' ];

    if ( empty( $data['meta_desc'] ) )
        $issues[] = [ 'field' => 'meta_desc', 'severity' => 'error', 'message' => 'Missing meta description' ];

    if ( ! empty( $data['meta_desc'] ) && strlen( $data['meta_desc'] ) > 155 )
        $issues[] = [ 'field' => 'meta_desc', 'severity' => 'warning', 'message' => 'Meta description too long (over 155 chars)' ];

    if ( ! empty( $data['meta_title'] ) && strlen( $data['meta_title'] ) > 60 )
        $issues[] = [ 'field' => 'meta_title', 'severity' => 'warning', 'message' => 'Meta title too long (over 60 chars)' ];

    if ( empty( $data['focus_keyword'] ) )
        $issues[] = [ 'field' => 'focus_keyword', 'severity' => 'notice', 'message' => 'No focus keyword set' ];

    if ( $data['h1_count'] === 0 )
        $issues[] = [ 'field' => 'h1', 'severity' => 'error', 'message' => 'Missing H1 tag' ];

    if ( $data['h1_count'] > 1 )
        $issues[] = [ 'field' => 'h1', 'severity' => 'warning', 'message' => 'Multiple H1 tags found' ];

    if ( $data['word_count'] < 300 )
        $issues[] = [ 'field' => 'content', 'severity' => 'warning', 'message' => 'Thin content (under 300 words)' ];

    return $issues;
}

function od_get_sitemap_info() {
    $robots_url  = get_site_url() . '/robots.txt';
    $robots      = wp_remote_get( $robots_url, [ 'timeout' => 5 ] );
    $sitemap_url = '';

    if ( ! is_wp_error( $robots ) ) {
        $body = wp_remote_retrieve_body( $robots );
        preg_match( '/Sitemap:\s*(.+)/i', $body, $matches );
        if ( ! empty( $matches[1] ) ) {
            $sitemap_url = trim( $matches[1] );
        }
    }

    if ( ! $sitemap_url && defined( 'WPSEO_VERSION' ) ) {
        $sitemap_url = get_site_url() . '/sitemap_index.xml';
    }

    return [
        'sitemap_url'   => $sitemap_url,
        'robots_txt_ok' => ! is_wp_error( $robots ),
    ];
}


// ─────────────────────────────────────────────
// 6. APPLY ENDPOINT — write approved fixes
// ─────────────────────────────────────────────

function od_apply( WP_REST_Request $request ) {
    $body  = json_decode( $request->get_body(), true );
    $fixes = $body['fixes'] ?? [];

    if ( empty( $fixes ) ) {
        return new WP_Error( 'od_no_fixes', 'No fixes provided.', [ 'status' => 400 ] );
    }

    $applied = [];
    $failed  = [];

    foreach ( $fixes as $fix ) {
        $result = od_apply_single_fix( $fix );
        if ( $result === true ) {
            $applied[] = $fix['post_id'] ?? $fix['media_id'] ?? 'unknown';
        } else {
            $failed[] = [
                'id'    => $fix['post_id'] ?? $fix['media_id'] ?? 'unknown',
                'field' => $fix['field'],
                'error' => $result,
            ];
        }
    }

    return rest_ensure_response([
        'applied' => $applied,
        'failed'  => $failed,
        'total'   => count( $fixes ),
    ]);
}

function od_apply_single_fix( $fix ) {
    $field = $fix['field'] ?? '';
    $value = $fix['value'] ?? '';

    // ── Media fix (alt text) ──
    if ( isset( $fix['media_id'] ) ) {
        $media_id = intval( $fix['media_id'] );
        if ( ! get_post( $media_id ) ) return 'Media not found';

        if ( $field === 'alt_text' ) {
            update_post_meta( $media_id, '_wp_attachment_image_alt', sanitize_text_field( $value ) );
            return true;
        }
        return 'Unknown media field: ' . $field;
    }

    // ── Post / page fix ──
    if ( ! isset( $fix['post_id'] ) ) return 'No post_id or media_id provided';

    $post_id = intval( $fix['post_id'] );
    if ( ! get_post( $post_id ) ) return 'Post not found';

    switch ( $field ) {

        case 'meta_title':
            if ( defined( 'WPSEO_VERSION' ) ) {
                update_post_meta( $post_id, '_yoast_wpseo_title', sanitize_text_field( $value ) );
            } elseif ( defined( 'RANK_MATH_VERSION' ) ) {
                update_post_meta( $post_id, 'rank_math_title', sanitize_text_field( $value ) );
            } else {
                wp_update_post([ 'ID' => $post_id, 'post_title' => sanitize_text_field( $value ) ]);
            }
            return true;

        case 'meta_desc':
            if ( defined( 'WPSEO_VERSION' ) ) {
                update_post_meta( $post_id, '_yoast_wpseo_metadesc', sanitize_textarea_field( $value ) );
            } elseif ( defined( 'RANK_MATH_VERSION' ) ) {
                update_post_meta( $post_id, 'rank_math_description', sanitize_textarea_field( $value ) );
            } else {
                return 'No SEO plugin active to write meta description';
            }
            return true;

        case 'focus_keyword':
            if ( defined( 'WPSEO_VERSION' ) ) {
                update_post_meta( $post_id, '_yoast_wpseo_focuskw', sanitize_text_field( $value ) );
            } elseif ( defined( 'RANK_MATH_VERSION' ) ) {
                update_post_meta( $post_id, 'rank_math_focus_keyword', sanitize_text_field( $value ) );
            }
            return true;

        case 'canonical':
            if ( defined( 'WPSEO_VERSION' ) ) {
                update_post_meta( $post_id, '_yoast_wpseo_canonical', esc_url_raw( $value ) );
            }
            return true;

        case 'slug':
            $result = wp_update_post([
                'ID'        => $post_id,
                'post_name' => sanitize_title( $value ),
            ]);
            return is_wp_error( $result ) ? $result->get_error_message() : true;

        case 'title':
            $result = wp_update_post([
                'ID'         => $post_id,
                'post_title' => sanitize_text_field( $value ),
            ]);
            return is_wp_error( $result ) ? $result->get_error_message() : true;

        case 'schema_jsonld':
            json_decode( $value );
            if ( json_last_error() !== JSON_ERROR_NONE ) return 'Invalid JSON-LD payload';
            update_post_meta( $post_id, '_od_schema_jsonld', $value );
            return true;

        default:
            return 'Unknown field: ' . $field;
    }
}

// Self-contained output: no assumption about Yoast/RankMath schema graphs
// (varies by plugin/version), so we render our own <script> block directly.
function od_output_schema_jsonld() {
    if ( ! is_singular() ) return;
    $json = get_post_meta( get_the_ID(), '_od_schema_jsonld', true );
    if ( empty( $json ) || ! is_string( $json ) ) return;
    json_decode( $json );
    if ( json_last_error() !== JSON_ERROR_NONE ) return;
    echo '<script type="application/ld+json">' . str_ireplace( '</script', '<\/script', $json ) . '</script>' . "\n";
}
add_action( 'wp_head', 'od_output_schema_jsonld' );


// ─────────────────────────────────────────────
// 7. VERIFY ENDPOINT — confirm fix saved correctly
// ─────────────────────────────────────────────

function od_verify( WP_REST_Request $request ) {
    $post_id = intval( $request['id'] );
    $post    = get_post( $post_id );

    if ( ! $post ) {
        return new WP_Error( 'od_not_found', 'Post not found.', [ 'status' => 404 ] );
    }

    $meta_title  = '';
    $meta_desc   = '';
    $focus_kw    = '';
    $canonical   = '';

    if ( defined( 'WPSEO_VERSION' ) ) {
        $meta_title = get_post_meta( $post_id, '_yoast_wpseo_title', true ) ?: '';
        $meta_desc  = get_post_meta( $post_id, '_yoast_wpseo_metadesc', true ) ?: '';
        $focus_kw   = get_post_meta( $post_id, '_yoast_wpseo_focuskw', true ) ?: '';
        $canonical  = get_post_meta( $post_id, '_yoast_wpseo_canonical', true ) ?: '';
    }

    // 'saved' used to be hardcoded true regardless of what was actually in
    // the DB -- callers were trusting it as confirmation a write landed,
    // when it confirmed nothing. Now it only reports true when the caller
    // tells us which field + value to expect and that field actually
    // matches; with no expected value given, we can't claim to have
    // verified anything, so it's false rather than a meaningless default.
    $expected_field = $request->get_param( 'field' );
    $expected_value = $request->get_param( 'expected' );
    $current_by_field = [
        'meta_title'    => $meta_title,
        'meta_desc'     => $meta_desc,
        'focus_keyword' => $focus_kw,
        'canonical'     => $canonical,
    ];
    $saved = $expected_field && isset( $current_by_field[ $expected_field ] )
        ? trim( $current_by_field[ $expected_field ] ) === trim( (string) $expected_value )
        : false;

    return rest_ensure_response([
        'post_id'       => $post_id,
        'title'         => $post->post_title,
        'slug'          => $post->post_name,
        'meta_title'    => $meta_title,
        'meta_desc'     => $meta_desc,
        'focus_keyword' => $focus_kw,
        'canonical'     => $canonical,
        'saved'         => $saved,
    ]);
}


// ─────────────────────────────────────────────
// 8. ADMIN PAGE — show token + connection status
// ─────────────────────────────────────────────

add_action( 'admin_menu', 'od_admin_menu' );

function od_admin_menu() {
    add_options_page(
        'Orange Door SEO',
        'Orange Door',
        'manage_options',
        'orange-door',
        'od_admin_page'
    );
}

function od_admin_page() {
    $token = get_option( 'od_secret_token', 'Not generated yet' );
    ?>
    <div class="wrap">
        <h1>Orange Door SEO</h1>
        <table class="form-table">
            <tr>
                <th>Site URL</th>
                <td><code><?php echo esc_html( get_site_url() ); ?></code></td>
            </tr>
            <tr>
                <th>Secret Token</th>
                <td><code><?php echo esc_html( $token ); ?></code></td>
            </tr>
            <tr>
                <th>Yoast SEO</th>
                <td><?php echo defined('WPSEO_VERSION') ? '&#10003; Active' : '&#10007; Not installed'; ?></td>
            </tr>
            <tr>
                <th>Scan endpoint</th>
                <td><code><?php echo esc_html( get_site_url() ); ?>/wp-json/orangedoor/v1/scan</code></td>
            </tr>
        </table>
        <p>This plugin is connected to <strong>Orange Door</strong>. Fixes are applied automatically when approved in your Orange Door dashboard.</p>
    </div>
    <?php
}
