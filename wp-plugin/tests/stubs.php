<?php
// Minimal in-memory stand-ins for the WordPress functions the agent and change
// engine use, so their logic can be tested with plain `php` (no WordPress).
// Behaviour that matters here is copied from WordPress: update_post_meta()
// runs wp_unslash() on what it is given, which is why the code wp_slash()es first.

define( 'ABSPATH', __DIR__ . '/' );
define( 'OD_PLUGIN_VERSION', '2.0.0' );
define( 'OD_PLUGIN_FILE', __FILE__ );
define( 'OD_BACKEND_BASE', getenv( 'OD_E2E_BASE' ) ?: 'https://example.test/functions/v1' );
define( 'OD_AGENT_ENABLED', true );

$GLOBALS['od_opts'] = [];
$GLOBALS['od_meta'] = [];
$GLOBALS['od_posts'] = [ 10 => 'post', 11 => 'page', 20 => 'attachment' ];
$GLOBALS['od_http'] = [];          // recorded wp_remote_post calls
$GLOBALS['od_http_reply'] = null;  // callable(url, args) => response array

function add_action() {}
function add_filter() {}
function register_rest_route() {}
function wp_clear_scheduled_hook() {}
function get_option( $k, $d = false ) { return array_key_exists( $k, $GLOBALS['od_opts'] ) ? $GLOBALS['od_opts'][ $k ] : $d; }
function update_option( $k, $v, $a = null ) { $GLOBALS['od_opts'][ $k ] = $v; return true; }
function delete_option( $k ) { unset( $GLOBALS['od_opts'][ $k ] ); return true; }
function get_transient( $k ) { return get_option( '_t_' . $k, false ); }
function set_transient( $k, $v, $e = 0 ) { update_option( '_t_' . $k, $v ); return true; }
function delete_transient( $k ) { delete_option( '_t_' . $k ); return true; }
function wp_json_encode( $v ) { return json_encode( $v, JSON_UNESCAPED_SLASHES ); }
function wp_slash( $v ) { return is_array( $v ) ? array_map( 'wp_slash', $v ) : ( is_string( $v ) ? addslashes( $v ) : $v ); }
function wp_unslash( $v ) { return is_array( $v ) ? array_map( 'wp_unslash', $v ) : ( is_string( $v ) ? stripslashes( $v ) : $v ); }
function sanitize_text_field( $v ) { return trim( preg_replace( '/\s+/', ' ', strip_tags( (string) $v ) ) ); }
function sanitize_textarea_field( $v ) { return trim( strip_tags( (string) $v ) ); }
function sanitize_title( $v ) { return strtolower( preg_replace( '/[^a-z0-9]+/i', '-', $v ) ); }
function esc_url_raw( $v ) { return filter_var( $v, FILTER_VALIDATE_URL ) ? $v : ''; }
function esc_attr( $v ) { return htmlspecialchars( $v, ENT_QUOTES ); }
function sanitize_key( $v ) { return strtolower( $v ); }
function get_post( $id ) { return isset( $GLOBALS['od_posts'][ $id ] ) ? (object) [ 'ID' => $id ] : null; }
function get_post_type( $id ) { return $GLOBALS['od_posts'][ $id ] ?? false; }
function metadata_exists( $t, $id, $k ) { return array_key_exists( $k, $GLOBALS['od_meta'][ $id ] ?? [] ); }
function get_post_meta( $id, $k, $single = false ) { return $GLOBALS['od_meta'][ $id ][ $k ] ?? ''; }
function update_post_meta( $id, $k, $v ) { $GLOBALS['od_meta'][ $id ][ $k ] = wp_unslash( $v ); return true; }
function delete_post_meta( $id, $k ) { unset( $GLOBALS['od_meta'][ $id ][ $k ] ); return true; }
function get_bloginfo() { return '6.9'; }
function wp_timezone_string() { return 'America/New_York'; }
function get_site_url() { return 'https://client.example'; }
function od_get_active_seo_plugins() { return []; }
function is_wp_error( $v ) { return $v instanceof WP_Error; }
class WP_Error { public $m; function __construct( $c = '', $m = '' ) { $this->m = $m; } function get_error_message() { return $this->m; } }
function wp_remote_retrieve_response_code( $r ) { return $r['code']; }
function wp_remote_retrieve_body( $r ) { return $r['body']; }
function wp_remote_post( $url, $args ) {
    $GLOBALS['od_http'][] = [ 'url' => $url, 'args' => $args ];
    $f = $GLOBALS['od_http_reply'];
    return $f ? $f( $url, $args ) : [ 'code' => 200, 'body' => '{}' ];
}
// site-level fixes live in the main plugin file; same behaviour, trimmed
function od_apply_site_level_fix( $field, $value ) {
    if ( $field === 'schema_jsonld' ) {
        json_decode( $value );
        if ( json_last_error() !== JSON_ERROR_NONE ) return 'Invalid JSON-LD payload';
        update_option( 'od_org_schema_jsonld', $value );
        return true;
    }
    if ( $field === 'llms_txt' ) { update_option( 'od_llms_txt', $value ); return true; }
    return 'Unknown site-level field: ' . $field;
}
