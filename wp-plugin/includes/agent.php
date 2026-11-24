<?php
/**
 * Site agent (plugin v2): how this site talks to Orange Door.
 *
 * The site calls Orange Door; Orange Door never calls into the site. Every
 * request is signed with an Ed25519 private key generated here that never
 * leaves this database. Orange Door only keeps the public half, so there is no
 * shared secret to leak, and nothing needs an inbound REST route reachable
 * through firewalls or security plugins.
 *
 *   register   once: prove we hold the key and get linked to the client
 *   heartbeat  every ~5 minutes: "alive", versions; answer says if work is waiting
 *   pull       fetch queued changes -> od_run_change() -> report the outcomes
 *
 * Wire format: see supabase/functions/_shared/wordpress/agentAuth.ts. The
 * signed text is  METHOD \n PATH \n TIMESTAMP \n NONCE \n sha256(BODY).
 */

if ( ! defined( 'ABSPATH' ) ) exit;

const OD_AGENT_SIGNED_PATH = '/site-agent';   // a fixed logical path, not the URL path (see site-agent/index.ts)
const OD_AGENT_TICK_EVERY  = 300;

function od_agent_enabled() {
    return defined( 'OD_AGENT_ENABLED' ) && OD_AGENT_ENABLED && function_exists( 'sodium_crypto_sign_keypair' );
}

// ── keys ─────────────────────────────────────────────────────────────────

/** [ secret_key (64 bytes), public_key (32 bytes) ], created on first use. */
function od_agent_keypair() {
    $stored = get_option( 'od_agent_secret' );
    if ( $stored ) {
        $sk = base64_decode( $stored, true );
        if ( $sk !== false && strlen( $sk ) === SODIUM_CRYPTO_SIGN_SECRETKEYBYTES ) {
            return [ $sk, sodium_crypto_sign_publickey_from_secretkey( $sk ) ];
        }
    }
    $kp = sodium_crypto_sign_keypair();
    $sk = sodium_crypto_sign_secretkey( $kp );
    update_option( 'od_agent_secret', base64_encode( $sk ), false );   // autoload off
    return [ $sk, sodium_crypto_sign_publickey( $kp ) ];
}

function od_agent_sign( $message ) {
    list( $sk ) = od_agent_keypair();
    return base64_encode( sodium_crypto_sign_detached( $message, $sk ) );
}

function od_agent_canonical( $method, $timestamp, $nonce, $body ) {
    return strtoupper( $method ) . "\n" . OD_AGENT_SIGNED_PATH . "\n" . $timestamp . "\n" . $nonce . "\n" . hash( 'sha256', $body );
}

// ── challenge: lets Orange Door check that we really hold the key ────────

add_action( 'rest_api_init', function () {
    register_rest_route( 'orangedoor/v1', '/challenge', [
        'methods'             => 'GET',
        'permission_callback' => '__return_true',
        'callback'            => function ( WP_REST_Request $request ) {
            $c = (string) $request->get_param( 'c' );
            if ( ! od_agent_enabled() || ! preg_match( '/^[a-f0-9]{32}$/', $c ) ) {
                return new WP_Error( 'od_bad_challenge', 'Bad challenge.', [ 'status' => 400 ] );
            }
            // The "od-register" prefix can never collide with a signed API request
            // (those start with an HTTP method), so this proves nothing else.
            return rest_ensure_response( [ 'signature' => od_agent_sign( "od-register\n" . $c ) ] );
        },
    ] );
} );

// ── talking to Orange Door ───────────────────────────────────────────────

/** @return array{ok:bool,status:int,data:array,error:string} */
function od_agent_post( $action, $payload = [], $signed = true ) {
    $body    = wp_json_encode( array_merge( [ 'action' => $action ], $payload ) );
    $headers = [ 'Content-Type' => 'application/json' ];
    if ( $signed ) {
        $ts    = (string) time();
        $nonce = bin2hex( random_bytes( 16 ) );
        $headers['X-OD-Site']      = (string) get_option( 'od_agent_site_id' );
        $headers['X-OD-Timestamp'] = $ts;
        $headers['X-OD-Nonce']     = $nonce;
        $headers['X-OD-Signature'] = od_agent_sign( od_agent_canonical( 'POST', $ts, $nonce, $body ) );
    }
    $res = wp_remote_post( OD_BACKEND_BASE . '/site-agent', [ 'body' => $body, 'headers' => $headers, 'timeout' => 20 ] );
    if ( is_wp_error( $res ) ) return [ 'ok' => false, 'status' => 0, 'data' => [], 'error' => $res->get_error_message() ];
    $status = (int) wp_remote_retrieve_response_code( $res );
    $data   = json_decode( wp_remote_retrieve_body( $res ), true );
    return [
        'ok'     => $status >= 200 && $status < 300,
        'status' => $status,
        'data'   => is_array( $data ) ? $data : [],
        'error'  => is_array( $data ) && isset( $data['error'] ) ? (string) $data['error'] : '',
    ];
}

function od_agent_facts() {
    return [
        'plugin_version' => OD_PLUGIN_VERSION,
        'wp_version'     => get_bloginfo( 'version' ),
        'php_version'    => PHP_VERSION,
        'plugins'        => od_get_active_seo_plugins(),
        'timezone'       => wp_timezone_string(),
    ];
}

function od_agent_note_error( $message ) {
    $errors = get_option( 'od_agent_errors', [] );
    if ( ! is_array( $errors ) ) $errors = [];
    $errors[] = gmdate( 'c' ) . ' ' . substr( (string) $message, 0, 200 );
    update_option( 'od_agent_errors', array_slice( $errors, -5 ), false );
}

// ── registration ─────────────────────────────────────────────────────────

function od_agent_register() {
    update_option( 'od_connect_last_attempt', time() );
    list( , $pk ) = od_agent_keypair();
    $r = od_agent_post( 'register', array_merge( od_agent_facts(), [
        'site_url'   => get_site_url(),
        'public_key' => base64_encode( $pk ),
    ] ), false );

    if ( ! $r['ok'] || empty( $r['data']['site_id'] ) ) {
        update_option( 'od_connect_status', 'error' );
        update_option( 'od_connect_error', $r['error'] ?: 'Could not reach Orange Door.' );
        return false;
    }
    update_option( 'od_agent_site_id', sanitize_text_field( $r['data']['site_id'] ) );
    update_option( 'od_connect_status', 'connected' );
    update_option( 'od_connect_error', '' );
    update_option( 'od_plugin_version', OD_PLUGIN_VERSION );
    if ( ! empty( $r['data']['tracking_key'] ) && preg_match( '/^[a-f0-9]{32}$/', $r['data']['tracking_key'] ) ) {
        update_option( 'od_tracking_key', $r['data']['tracking_key'] );
        update_option( 'od_tracking_enabled', empty( $r['data']['tracking_enabled'] ) ? '0' : '1' );
    }
    // The old shared token is dead server-side; remove it so the v1 routes can't be used.
    delete_option( 'od_secret_token' );
    return true;
}

// ── the periodic check-in ────────────────────────────────────────────────

add_filter( 'cron_schedules', function ( $s ) {
    $s['od_five_minutes'] = [ 'interval' => OD_AGENT_TICK_EVERY, 'display' => 'Every 5 minutes (Orange Door)' ];
    return $s;
} );

add_action( 'od_agent_tick', 'od_agent_tick' );

add_action( 'init', function () {
    if ( ! od_agent_enabled() ) return;
    if ( ! wp_next_scheduled( 'od_agent_tick' ) ) wp_schedule_event( time() + 60, 'od_five_minutes', 'od_agent_tick' );
} );

// WP-Cron only runs when someone visits the site, and some hosts disable it.
// An admin page load is a second chance, so a quiet site still checks in.
add_action( 'admin_init', function () {
    if ( ! od_agent_enabled() ) return;
    $status = get_option( 'od_connect_status' );
    if ( $status === 'disconnected' ) return;
    if ( ! get_option( 'od_agent_site_id' ) ) {
        if ( time() - (int) get_option( 'od_connect_last_attempt', 0 ) >= 60 ) od_agent_register();
        return;
    }
    if ( time() - (int) get_option( 'od_agent_last_tick', 0 ) > 2 * OD_AGENT_TICK_EVERY ) od_agent_tick();
} );

function od_agent_tick() {
    if ( ! od_agent_enabled() || ! get_option( 'od_agent_site_id' ) ) return;
    if ( get_transient( 'od_agent_lock' ) ) return;              // another tick is still running
    set_transient( 'od_agent_lock', 1, 120 );
    try {
        update_option( 'od_agent_last_tick', time(), false );
        $facts = od_agent_facts();
        $facts['errors'] = get_option( 'od_agent_errors', [] );
        $hb = od_agent_post( 'heartbeat', $facts );

        if ( $hb['status'] === 410 ) { od_agent_handle_disconnect(); return; }
        if ( ! $hb['ok'] ) { od_agent_note_error( 'heartbeat ' . $hb['status'] . ' ' . $hb['error'] ); return; }
        update_option( 'od_agent_errors', [], false );

        if ( (int) ( $hb['data']['pending_changes'] ?? 0 ) > 0 ) od_agent_process_changes();

        // A scan was asked for (or an earlier upload was cut short): send the inventory.
        if ( ! empty( $hb['data']['scan_requested'] ) || is_array( get_option( 'od_inventory_state' ) ) ) od_agent_push_inventory();
    } finally {
        delete_transient( 'od_agent_lock' );
    }
}

function od_agent_process_changes() {
    $pull = od_agent_post( 'pull' );
    if ( ! $pull['ok'] ) { od_agent_note_error( 'pull ' . $pull['status'] . ' ' . $pull['error'] ); return; }
    $changes = $pull['data']['changes'] ?? [];
    if ( ! is_array( $changes ) || ! $changes ) return;

    $results = [];
    foreach ( $changes as $c ) {
        if ( is_array( $c ) ) $results[] = od_run_change( $c );
    }
    $rep = od_agent_post( 'report', [ 'results' => $results ] );
    if ( ! $rep['ok'] ) od_agent_note_error( 'report ' . $rep['status'] . ' ' . $rep['error'] );
    // If the report didn't arrive, the changes stay 'delivered' server-side and are
    // handed out again after 10 minutes; applying the same value twice is harmless.
}

/** Orange Door told us (HTTP 410) the connection was removed from the dashboard. */
function od_agent_handle_disconnect() {
    update_option( 'od_connect_status', 'disconnected' );
    update_option( 'od_connect_error', '' );
    wp_clear_scheduled_hook( 'od_agent_tick' );
    delete_option( 'od_agent_site_id' );
    delete_option( 'od_agent_secret' );

    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';
    $basename = plugin_basename( OD_PLUGIN_FILE );
    deactivate_plugins( $basename, true );
    if ( ! is_plugin_active( $basename ) && get_filesystem_method() === 'direct' ) delete_plugins( [ $basename ] );
}
