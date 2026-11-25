<?php
/**
 * Inventory upload (plugin v2): when Orange Door asks for a scan, send this
 * site's pages, posts and images as a series of small signed requests.
 *
 * Small parts and a time budget keep this safe on slow shared hosting: no
 * single request is large, and if PHP's time limit is near we stop, remember
 * where we were, and carry on at the next check-in. Nothing here reads a
 * page's content beyond the counts the SEO audit needs.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

const OD_INV_ITEMS_PER_PART = 40;     // posts/pages per request
const OD_INV_MEDIA_PER_PART = 300;    // images per request (small records)
const OD_INV_BUDGET_SECONDS = 20;     // stop and resume later beyond this
const OD_INV_MAX_AGE        = 3600;   // abandon a stalled upload after an hour

/** The ordered list of parts to send. */
function od_inventory_plan() {
    $parts = [];
    $types = [ 'posts' => [ 'post', 'publish', OD_INV_ITEMS_PER_PART ], 'pages' => [ 'page', 'publish', OD_INV_ITEMS_PER_PART ], 'media' => [ 'attachment', 'inherit', OD_INV_MEDIA_PER_PART ] ];
    foreach ( $types as $kind => $cfg ) {
        $q = new WP_Query( [ 'post_type' => $cfg[0], 'post_status' => $cfg[1], 'posts_per_page' => 1, 'fields' => 'ids', 'no_found_rows' => false ] );
        $count = (int) $q->found_posts;
        for ( $offset = 0; $offset < $count; $offset += $cfg[2] ) {
            $parts[] = [ 'kind' => $kind, 'type' => $cfg[0], 'status' => $cfg[1], 'offset' => $offset, 'limit' => $cfg[2] ];
        }
    }
    $parts[] = [ 'kind' => 'meta' ];
    return $parts;
}

function od_inventory_part_payload( $part ) {
    if ( $part['kind'] === 'meta' ) return [ 'sitemap' => od_get_sitemap_info() ];

    $posts = get_posts( [
        'post_type'      => $part['type'],
        'post_status'    => $part['status'],
        'posts_per_page' => $part['limit'],
        'offset'         => $part['offset'],
        'orderby'        => 'ID',
        'order'          => 'ASC',
        'suppress_filters' => true,
    ] );

    $items = [];
    foreach ( $posts as $post ) {
        if ( $part['kind'] === 'media' ) {
            $alt = get_post_meta( $post->ID, '_wp_attachment_image_alt', true );
            $file = get_attached_file( $post->ID );
            $items[] = [
                'id'          => $post->ID,
                'url'         => wp_get_attachment_url( $post->ID ),
                'filename'    => $file ? basename( $file ) : '',
                'alt_text'    => $alt ?: '',
                'missing_alt' => empty( $alt ),
            ];
        } else {
            $items[] = od_build_post_data( $post );
        }
    }
    return [ 'items' => $items ];
}

/**
 * Send as much of the inventory as the time budget allows.
 * @return string 'done' | 'partial' | 'error'
 */
function od_agent_push_inventory() {
    $state = get_option( 'od_inventory_state' );
    if ( ! is_array( $state ) || empty( $state['upload_id'] ) || ( time() - (int) ( $state['started'] ?? 0 ) ) > OD_INV_MAX_AGE ) {
        $state = [ 'upload_id' => bin2hex( random_bytes( 8 ) ), 'parts' => od_inventory_plan(), 'next' => 0, 'started' => time() ];
    }
    $total = count( $state['parts'] );
    $began = microtime( true );

    while ( $state['next'] < $total ) {
        if ( ( microtime( true ) - $began ) > OD_INV_BUDGET_SECONDS ) {
            update_option( 'od_inventory_state', $state, false );
            wp_schedule_single_event( time() + 30, 'od_agent_tick' );   // carry on shortly
            return 'partial';
        }
        $part = $state['parts'][ $state['next'] ];
        $payload = od_inventory_part_payload( $part );
        $r = od_agent_post( 'inventory', array_merge( $payload, [
            'upload_id'   => $state['upload_id'],
            'part'        => $state['next'],
            'parts_total' => $total,
            'kind'        => $part['kind'],
        ] ) );
        if ( ! $r['ok'] ) {
            od_agent_note_error( 'inventory ' . $r['status'] . ' ' . $r['error'] );
            update_option( 'od_inventory_state', $state, false );   // retry this part next time
            return 'error';
        }
        $state['next']++;
    }
    delete_option( 'od_inventory_state' );
    return 'done';
}
