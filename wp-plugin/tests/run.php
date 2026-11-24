<?php
// php wp-plugin/tests/run.php   -- exits non-zero on the first failure
require __DIR__ . '/stubs.php';
require __DIR__ . '/../includes/changes.php';
require __DIR__ . '/../includes/agent.php';
require __DIR__ . '/../includes/inventory.php';

$fails = 0; $n = 0;
function check( $label, $cond ) { global $fails, $n; $n++; if ( ! $cond ) { $fails++; echo "FAIL: $label\n"; } }
function reset_site() { $GLOBALS['od_opts'] = []; $GLOBALS['od_meta'] = []; $GLOBALS['od_http'] = []; $GLOBALS['od_http_reply'] = null; }

// ── change engine: no SEO plugin (overlay store) ──────────────────────────
reset_site();
$r = od_run_change( [ 'id' => 'c1', 'op' => 'apply', 'field' => 'meta_title', 'post_id' => 10, 'value' => 'Plumber "Pro" & Sons | Acme' ] );
check( 'apply meta_title ok', $r['outcome'] === 'applied' );
check( 'meta_title stored in our own key, not post_title', get_post_meta( 10, '_od_meta_title' ) === 'Plumber "Pro" & Sons | Acme' );
check( 'before is empty when nothing was there', $r['before'] === '' );

$r = od_run_change( [ 'id' => 'c2', 'op' => 'apply', 'field' => 'meta_title', 'post_id' => 10, 'value' => 'Second title' ] );
check( 'second apply reports the previous value', $r['before'] === 'Plumber "Pro" & Sons | Acme' );
$r = od_run_change( [ 'id' => 'c3', 'op' => 'revert', 'field' => 'meta_title', 'post_id' => 10 ] );
check( 'revert ok', $r['outcome'] === 'reverted' );
check( 'revert returns to the TRUE original (nothing), not the first change', ! metadata_exists( 'post', 10, '_od_meta_title' ) );
check( 'undo record is cleaned up', ! metadata_exists( 'post', 10, '_od_undo' ) );

// original value present before our change
reset_site();
$GLOBALS['od_meta'][11]['_od_meta_desc'] = 'Original description';
od_run_change( [ 'id' => 'c4', 'op' => 'apply', 'field' => 'meta_desc', 'post_id' => 11, 'value' => 'New description' ] );
check( 'desc written', get_post_meta( 11, '_od_meta_desc' ) === 'New description' );
od_run_change( [ 'id' => 'c5', 'op' => 'revert', 'field' => 'meta_desc', 'post_id' => 11 ] );
check( 'desc restored to original', get_post_meta( 11, '_od_meta_desc' ) === 'Original description' );

// image alt: real field, restored on revert
reset_site();
$GLOBALS['od_meta'][20]['_wp_attachment_image_alt'] = '';
$r = od_run_change( [ 'id' => 'c6', 'op' => 'apply', 'field' => 'alt_text', 'media_id' => 20, 'value' => 'A red door' ] );
check( 'alt applied', $r['outcome'] === 'applied' && get_post_meta( 20, '_wp_attachment_image_alt' ) === 'A red door' );
od_run_change( [ 'id' => 'c7', 'op' => 'revert', 'field' => 'alt_text', 'media_id' => 20 ] );
check( 'alt restored to empty string it had', get_post_meta( 20, '_wp_attachment_image_alt' ) === '' );

// site-level
reset_site();
$r = od_run_change( [ 'id' => 'c8', 'op' => 'apply', 'field' => 'schema_jsonld', 'value' => '{"@type":"LocalBusiness"}' ] );
check( 'schema applied', $r['outcome'] === 'applied' && get_option( 'od_org_schema_jsonld' ) === '{"@type":"LocalBusiness"}' );
od_run_change( [ 'id' => 'c9', 'op' => 'revert', 'field' => 'schema_jsonld' ] );
check( 'schema removed on revert (it did not exist before)', get_option( 'od_org_schema_jsonld', 'GONE' ) === 'GONE' );

// safety rails
reset_site();
check( 'title (visible heading) is not an allowed field', od_run_change( [ 'id' => 'x', 'op' => 'apply', 'field' => 'title', 'post_id' => 10, 'value' => 'Hacked' ] )['outcome'] === 'failed' );
check( 'slug is not an allowed field', od_run_change( [ 'id' => 'x', 'op' => 'apply', 'field' => 'slug', 'post_id' => 10, 'value' => 'x' ] )['outcome'] === 'failed' );
check( 'unknown post fails cleanly', od_run_change( [ 'id' => 'x', 'op' => 'apply', 'field' => 'meta_title', 'post_id' => 999, 'value' => 'x' ] )['outcome'] === 'failed' );
check( 'empty value refused', od_run_change( [ 'id' => 'x', 'op' => 'apply', 'field' => 'meta_title', 'post_id' => 10, 'value' => '  ' ] )['outcome'] === 'failed' );
check( 'bad JSON-LD refused', od_run_change( [ 'id' => 'x', 'op' => 'apply', 'field' => 'schema_jsonld', 'value' => '{nope' ] )['outcome'] === 'failed' );
check( 'revert with nothing recorded and no server value fails cleanly', od_run_change( [ 'id' => 'x', 'op' => 'revert', 'field' => 'meta_title', 'post_id' => 10 ] )['outcome'] === 'failed' );
check( 'revert falls back to the value Orange Door saw', ( function () {
    od_run_change( [ 'id' => 'x', 'op' => 'revert', 'field' => 'meta_title', 'post_id' => 10, 'before' => 'Server saw this' ] );
    return get_post_meta( 10, '_od_meta_title' ) === 'Server saw this';
} )() );

// ── agent: tick flow ──────────────────────────────────────────────────────
reset_site();
od_agent_keypair();
update_option( 'od_agent_site_id', '11111111-1111-1111-1111-111111111111' );
$GLOBALS['od_http_reply'] = function ( $url, $args ) {
    $body = json_decode( $args['body'], true );
    if ( $body['action'] === 'heartbeat' ) return [ 'code' => 200, 'body' => json_encode( [ 'ok' => true, 'pending_changes' => 1 ] ) ];
    if ( $body['action'] === 'pull' ) return [ 'code' => 200, 'body' => json_encode( [ 'changes' => [ [ 'id' => 'chg-1', 'op' => 'apply', 'field' => 'meta_title', 'post_id' => 10, 'media_id' => null, 'value' => 'Hello' ] ] ] ) ];
    return [ 'code' => 200, 'body' => '{"ok":true}' ];
};
od_agent_tick();
$actions = array_map( fn( $c ) => json_decode( $c['args']['body'], true )['action'], $GLOBALS['od_http'] );
check( 'tick: heartbeat, pull, report in order', $actions === [ 'heartbeat', 'pull', 'report' ] );
$report = json_decode( end( $GLOBALS['od_http'] )['args']['body'], true );
check( 'tick: report carries the applied outcome', $report['results'][0]['id'] === 'chg-1' && $report['results'][0]['outcome'] === 'applied' );
check( 'tick: change really landed', get_post_meta( 10, '_od_meta_title' ) === 'Hello' );
check( 'tick: lock released', get_transient( 'od_agent_lock' ) === false );
$h = end( $GLOBALS['od_http'] )['args']['headers'];
check( 'requests are signed', ! empty( $h['X-OD-Signature'] ) && ! empty( $h['X-OD-Nonce'] ) && $h['X-OD-Site'] === '11111111-1111-1111-1111-111111111111' );

// no pending work -> no pull
$GLOBALS['od_http'] = [];
$GLOBALS['od_http_reply'] = fn() => [ 'code' => 200, 'body' => '{"ok":true,"pending_changes":0}' ];
od_agent_tick();
check( 'idle tick only sends a heartbeat', count( $GLOBALS['od_http'] ) === 1 );

// a failing backend is recorded, not fatal
$GLOBALS['od_http'] = [];
$GLOBALS['od_http_reply'] = fn() => [ 'code' => 500, 'body' => '{"error":"boom"}' ];
od_agent_tick();
check( 'backend error is noted', count( get_option( 'od_agent_errors', [] ) ) === 1 );
check( 'lock still released after an error', get_transient( 'od_agent_lock' ) === false );

// a concurrent tick is skipped
$GLOBALS['od_http'] = [];
set_transient( 'od_agent_lock', 1 );
od_agent_tick();
check( 'tick skipped while locked', count( $GLOBALS['od_http'] ) === 0 );

// ── inventory upload ──────────────────────────────────────────────────────
reset_site();
od_agent_keypair();
update_option( 'od_agent_site_id', '11111111-1111-1111-1111-111111111111' );
$GLOBALS['od_content'] = [ 'post' => 85, 'page' => 5, 'attachment' => 650 ];
$GLOBALS['od_http_reply'] = fn() => [ 'code' => 200, 'body' => '{"ok":true}' ];
$plan = od_inventory_plan();
// posts: ceil(85/40)=3, pages: 1, media: ceil(650/300)=3, meta: 1
check( 'plan has 3 post parts, 1 page part, 3 media parts and a meta part', count( $plan ) === 8 );
check( 'plan ends with the meta (sitemap) part', end( $plan )['kind'] === 'meta' );

$res = od_agent_push_inventory();
check( 'upload completes', $res === 'done' );
$sent = array_map( fn( $c ) => json_decode( $c['args']['body'], true ), $GLOBALS['od_http'] );
check( 'one signed request per part', count( $sent ) === 8 && $sent[0]['action'] === 'inventory' );
check( 'all parts share one upload id and know the total', count( array_unique( array_column( $sent, 'upload_id' ) ) ) === 1 && $sent[7]['parts_total'] === 8 );
check( 'parts are numbered 0..7 in order', array_column( $sent, 'part' ) === range( 0, 7 ) );
$ids = []; foreach ( array_slice( $sent, 0, 3 ) as $p ) foreach ( $p['items'] as $it ) $ids[] = $it['id'];
check( 'posts are all sent exactly once, in pages of 40', $ids === range( 1, 85 ) && count( $sent[0]['items'] ) === 40 );
check( 'media records carry alt-text state', $sent[4]['items'][0]['missing_alt'] === true && strpos( $sent[4]['items'][0]['filename'], 'img-' ) === 0 );
check( 'last part is the sitemap info', $sent[7]['kind'] === 'meta' && $sent[7]['sitemap']['robots_txt_ok'] === true );
check( 'state cleared after a full upload', get_option( 'od_inventory_state', 'GONE' ) === 'GONE' );

// failure part-way: resume from the failed part, same upload id
reset_site(); od_agent_keypair(); update_option( 'od_agent_site_id', '11111111-1111-1111-1111-111111111111' );
$calls = 0;
$GLOBALS['od_http_reply'] = function ( $u, $a ) use ( &$calls ) { $calls++; return $calls === 3 ? [ 'code' => 500, 'body' => '{"error":"x"}' ] : [ 'code' => 200, 'body' => '{"ok":true}' ]; };
check( 'a failing part reports error', od_agent_push_inventory() === 'error' );
$st = get_option( 'od_inventory_state' );
check( 'progress is remembered (2 parts sent, retry the 3rd)', is_array( $st ) && $st['next'] === 2 );
$GLOBALS['od_http'] = []; $GLOBALS['od_http_reply'] = fn() => [ 'code' => 200, 'body' => '{"ok":true}' ];
check( 'resume finishes the rest', od_agent_push_inventory() === 'done' );
$first = json_decode( $GLOBALS['od_http'][0]['args']['body'], true );
check( 'resume continues with the same upload id at the failed part', $first['upload_id'] === $st['upload_id'] && $first['part'] === 2 );

// a scan request in the heartbeat triggers the upload from a tick
reset_site(); od_agent_keypair(); update_option( 'od_agent_site_id', '11111111-1111-1111-1111-111111111111' );
$GLOBALS['od_content'] = [ 'post' => 3, 'page' => 0, 'attachment' => 0 ];
$GLOBALS['od_http_reply'] = fn( $u, $a ) => [ 'code' => 200, 'body' => json_decode( $a['body'], true )['action'] === 'heartbeat' ? '{"ok":true,"pending_changes":0,"scan_requested":true}' : '{"ok":true}' ];
od_agent_tick();
$acts = array_map( fn( $c ) => json_decode( $c['args']['body'], true )['action'], $GLOBALS['od_http'] );
check( 'scan_requested heartbeat leads to inventory parts', $acts === [ 'heartbeat', 'inventory', 'inventory' ] );

echo $fails ? "\n$fails of $n checks failed\n" : "all $n checks passed\n";
exit( $fails ? 1 : 0 );
