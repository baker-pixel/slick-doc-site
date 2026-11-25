<?php
// Prints a signed request exactly as the plugin would send it, for the Deno interop test.
require __DIR__ . '/stubs.php';
require __DIR__ . '/../includes/changes.php';
require __DIR__ . '/../includes/agent.php';

$body = $argv[1] ?? '{"action":"heartbeat"}';
list( , $pk ) = od_agent_keypair();
update_option( 'od_agent_site_id', '22222222-2222-2222-2222-222222222222' );
$GLOBALS['od_http_reply'] = fn() => [ 'code' => 200, 'body' => '{}' ];
od_agent_post( 'heartbeat', [] );
$sent = $GLOBALS['od_http'][0]['args'];
echo json_encode( [
    'public_key' => base64_encode( $pk ),
    'body'       => $sent['body'],
    'headers'    => $sent['headers'],
    'challenge'  => 'abcdef0123456789abcdef0123456789',
    'challenge_signature' => od_agent_sign( "od-register\nabcdef0123456789abcdef0123456789" ),
] );
