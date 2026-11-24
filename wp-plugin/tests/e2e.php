<?php
// Runs the REAL plugin agent code (WordPress stubbed) against a REAL deployed site-agent.
//   php e2e.php init  <state.json>            -> creates a keypair, prints the public key
//   php e2e.php tick  <state.json> <site_id>  -> one heartbeat/pull/report cycle over HTTPS
require __DIR__ . '/stubs.php';
require __DIR__ . '/../includes/changes.php';
require __DIR__ . '/../includes/agent.php';
require __DIR__ . '/../includes/inventory.php';
$GLOBALS['od_content'] = [ 'post' => (int) getenv( 'OD_E2E_POSTS' ), 'page' => (int) getenv( 'OD_E2E_PAGES' ), 'attachment' => (int) getenv( 'OD_E2E_MEDIA' ) ];

list( , $mode, $state_file ) = array_pad( $argv, 3, null );
$GLOBALS['od_opts'] = is_file( $state_file ) ? json_decode( file_get_contents( $state_file ), true ) : [];
$GLOBALS['od_meta'] = $GLOBALS['od_opts']['_meta'] ?? [];
unset( $GLOBALS['od_opts']['_meta'] );
$url_override = getenv( 'OD_E2E_BASE' );

// real HTTP instead of the stub
$GLOBALS['od_http_reply'] = function ( $url, $args ) {
    $ch = curl_init( $url );
    curl_setopt_array( $ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $args['body'], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => array_map( fn( $k, $v ) => "$k: $v", array_keys( $args['headers'] ), $args['headers'] ),
    ] );
    $body = curl_exec( $ch );
    $code = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
    return [ 'code' => $code, 'body' => (string) $body ];
};

function save( $f ) { $o = $GLOBALS['od_opts']; $o['_meta'] = $GLOBALS['od_meta']; file_put_contents( $f, json_encode( $o ) ); }

if ( $mode === 'init' ) {
    list( , $pk ) = od_agent_keypair();
    $GLOBALS['od_meta'][10]['_od_note'] = 'seed';
    save( $state_file );
    echo base64_encode( $pk );
    exit( 0 );
}
if ( $mode === 'tick' ) {
    update_option( 'od_agent_site_id', $argv[3] );
    $GLOBALS['od_opts']['_t_od_agent_lock'] = false;
    od_agent_tick();
    save( $state_file );
    echo json_encode( [ 'meta' => $GLOBALS['od_meta'], 'errors' => get_option( 'od_agent_errors', [] ), 'status' => get_option( 'od_connect_status' ) ] );
    exit( 0 );
}
