<?php
/**
 * Change engine (plugin v2): applies one change from Orange Door and can take it back.
 *
 * Rules that make it safe to run unattended on a client's live site:
 *  - Only an allow-list of fields is ever touched. Nothing here edits post
 *    content, a post's visible title, or its URL slug.
 *  - Before a field is changed its original state is remembered (including
 *    "there was nothing here"), once, so any number of applies can still be
 *    undone back to the true original.
 *  - Every write is read back; "saved" means the value is really stored.
 *  - Titles and descriptions go to the SEO plugin's own fields when one is
 *    active (so they show in its editor and survive without us). With no SEO
 *    plugin they are stored by us and printed through WordPress's own title
 *    and <head> hooks.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

const OD_POST_FIELDS = [ 'meta_title', 'meta_desc', 'focus_keyword', 'canonical', 'faq_jsonld' ];
const OD_SITE_FIELDS = [ 'schema_jsonld', 'llms_txt' ];

/** Which SEO plugin owns the title/description fields on this site. */
function od_seo_adapter() {
    if ( defined( 'WPSEO_VERSION' ) )      return 'yoast';
    if ( defined( 'RANK_MATH_VERSION' ) )  return 'rankmath';
    if ( defined( 'SEOPRESS_VERSION' ) )   return 'seopress';
    return 'overlay';
}

function od_meta_key( $field, $adapter ) {
    $map = [
        'yoast'    => [ 'meta_title' => '_yoast_wpseo_title', 'meta_desc' => '_yoast_wpseo_metadesc', 'focus_keyword' => '_yoast_wpseo_focuskw', 'canonical' => '_yoast_wpseo_canonical' ],
        'rankmath' => [ 'meta_title' => 'rank_math_title', 'meta_desc' => 'rank_math_description', 'focus_keyword' => 'rank_math_focus_keyword', 'canonical' => 'rank_math_canonical_url' ],
        'seopress' => [ 'meta_title' => '_seopress_titles_title', 'meta_desc' => '_seopress_titles_desc', 'focus_keyword' => '_seopress_analysis_target_kw', 'canonical' => '_seopress_robots_canonical' ],
        'overlay'  => [ 'meta_title' => '_od_meta_title', 'meta_desc' => '_od_meta_desc', 'focus_keyword' => '_od_focus_keyword', 'canonical' => '_od_canonical' ],
    ];
    if ( $field === 'faq_jsonld' ) return '_od_faq_jsonld';
    return $map[ $adapter ][ $field ] ?? null;
}

/** Current stored value of an SEO field, whichever SEO plugin (or our own store) holds it. */
function od_read_seo_field( $post_id, $field ) {
    $key = od_meta_key( $field, od_seo_adapter() );
    if ( ! $key ) return '';
    $v = get_post_meta( $post_id, $key, true );
    return is_string( $v ) ? $v : '';
}

function od_clean_value( $field, $value ) {
    switch ( $field ) {
        case 'meta_desc':   return sanitize_textarea_field( $value );
        case 'canonical':   return esc_url_raw( $value );
        case 'faq_jsonld':
            json_decode( $value );
            return json_last_error() === JSON_ERROR_NONE ? $value : null;
        default:            return sanitize_text_field( $value );
    }
}

// ── remembering the original ─────────────────────────────────────────────

/** Remember how $key looked on $object_id before our first write. Only the first call counts. */
function od_remember_original( $object_id, $field, $key ) {
    $undo = get_post_meta( $object_id, '_od_undo', true );
    if ( ! is_array( $undo ) ) $undo = [];
    if ( isset( $undo[ $field ] ) ) return;
    $existed = metadata_exists( 'post', $object_id, $key );
    $undo[ $field ] = [ 'key' => $key, 'existed' => $existed, 'before' => $existed ? (string) get_post_meta( $object_id, $key, true ) : '' ];
    update_post_meta( $object_id, '_od_undo', wp_slash( $undo ) );
}

/** Write $value to $key on $object_id, remembering the original; verify by reading it back. */
function od_write_meta( $object_id, $field, $key, $value ) {
    od_remember_original( $object_id, $field, $key );
    $before = metadata_exists( 'post', $object_id, $key ) ? (string) get_post_meta( $object_id, $key, true ) : '';
    update_post_meta( $object_id, $key, wp_slash( $value ) );
    if ( (string) get_post_meta( $object_id, $key, true ) !== $value ) {
        return [ 'ok' => false, 'error' => 'WordPress did not keep the new value (another plugin may be blocking meta updates).' ];
    }
    return [ 'ok' => true, 'before' => $before ];
}

/** Put a field back the way it was before our first change. */
function od_restore_meta( $object_id, $field, $server_before, $key ) {
    $undo = get_post_meta( $object_id, '_od_undo', true );
    if ( is_array( $undo ) && isset( $undo[ $field ] ) ) {
        $u = $undo[ $field ];
        if ( ! empty( $u['existed'] ) ) update_post_meta( $object_id, $u['key'], wp_slash( (string) $u['before'] ) );
        else delete_post_meta( $object_id, $u['key'] );
        unset( $undo[ $field ] );
        if ( $undo ) update_post_meta( $object_id, '_od_undo', wp_slash( $undo ) );
        else delete_post_meta( $object_id, '_od_undo' );
        return [ 'ok' => true ];
    }
    // No local record (e.g. the site was restored from a backup): fall back to
    // what Orange Door saw just before it applied the change.
    if ( $server_before === null || ! $key ) return [ 'ok' => false, 'error' => 'Nothing to undo: this change is no longer recorded on the site.' ];
    if ( $server_before === '' ) delete_post_meta( $object_id, $key );
    else update_post_meta( $object_id, $key, wp_slash( (string) $server_before ) );
    return [ 'ok' => true ];
}

// ── apply ────────────────────────────────────────────────────────────────

function od_apply_change( $c ) {
    $field = (string) ( $c['field'] ?? '' );
    $value = (string) ( $c['value'] ?? '' );

    if ( in_array( $field, OD_SITE_FIELDS, true ) ) return od_apply_site_change( $field, $value );

    if ( ! empty( $c['media_id'] ) ) {
        if ( $field !== 'alt_text' ) return [ 'ok' => false, 'error' => 'Unsupported change for an image: ' . $field ];
        $id = intval( $c['media_id'] );
        if ( get_post_type( $id ) !== 'attachment' ) return [ 'ok' => false, 'error' => 'Image not found.' ];
        return od_write_meta( $id, 'alt_text', '_wp_attachment_image_alt', sanitize_text_field( $value ) );
    }

    if ( ! in_array( $field, OD_POST_FIELDS, true ) ) return [ 'ok' => false, 'error' => 'Unsupported change: ' . $field ];
    $post_id = intval( $c['post_id'] ?? 0 );
    if ( ! $post_id || ! get_post( $post_id ) ) return [ 'ok' => false, 'error' => 'Page not found.' ];

    $clean = od_clean_value( $field, $value );
    if ( $clean === null ) return [ 'ok' => false, 'error' => 'Invalid structured data.' ];
    if ( $clean === '' ) return [ 'ok' => false, 'error' => 'Refusing to write an empty value.' ];

    $key = od_meta_key( $field, od_seo_adapter() );
    if ( ! $key ) return [ 'ok' => false, 'error' => 'No place to store ' . $field . ' on this site.' ];
    return od_write_meta( $post_id, $field, $key, $clean );
}

function od_site_option_for( $field ) {
    return $field === 'schema_jsonld' ? 'od_org_schema_jsonld' : 'od_llms_txt';
}

function od_apply_site_change( $field, $value ) {
    $opt    = od_site_option_for( $field );
    $before = (string) get_option( $opt, '' );
    $undo   = get_option( 'od_undo_site', [] );
    if ( ! is_array( $undo ) ) $undo = [];
    if ( ! isset( $undo[ $field ] ) ) {
        $undo[ $field ] = [ 'existed' => get_option( $opt, null ) !== null, 'before' => $before ];
        update_option( 'od_undo_site', $undo, false );
    }
    $r = od_apply_site_level_fix( $field, $value );   // validates, stores the option
    if ( $r !== true ) return [ 'ok' => false, 'error' => (string) $r ];
    if ( (string) get_option( $opt, '' ) !== $value ) return [ 'ok' => false, 'error' => 'WordPress did not keep the new value.' ];
    return [ 'ok' => true, 'before' => $before ];
}

// ── revert ───────────────────────────────────────────────────────────────

function od_revert_change( $c ) {
    $field = (string) ( $c['field'] ?? '' );

    if ( in_array( $field, OD_SITE_FIELDS, true ) ) {
        $undo = get_option( 'od_undo_site', [] );
        if ( ! is_array( $undo ) || ! isset( $undo[ $field ] ) ) return [ 'ok' => false, 'error' => 'Nothing to undo: this change is no longer recorded on the site.' ];
        $opt = od_site_option_for( $field );
        if ( ! empty( $undo[ $field ]['existed'] ) ) update_option( $opt, $undo[ $field ]['before'] );
        else delete_option( $opt );
        unset( $undo[ $field ] );
        update_option( 'od_undo_site', $undo, false );
        return [ 'ok' => true ];
    }

    $object_id = ! empty( $c['media_id'] ) ? intval( $c['media_id'] ) : intval( $c['post_id'] ?? 0 );
    if ( ! $object_id || ! get_post( $object_id ) ) return [ 'ok' => false, 'error' => 'Page or image not found.' ];
    $is_media = ! empty( $c['media_id'] );
    $key      = $is_media ? '_wp_attachment_image_alt' : od_meta_key( $field, od_seo_adapter() );
    return od_restore_meta( $object_id, $is_media ? 'alt_text' : $field, $c['before'] ?? null, $key );
}

/** Run one pulled change and describe the outcome in the shape the backend expects. Never throws. */
function od_run_change( $c ) {
    $id = (string) ( $c['id'] ?? '' );
    try {
        $revert = ( $c['op'] ?? 'apply' ) === 'revert';
        $r = $revert ? od_revert_change( $c ) : od_apply_change( $c );
        if ( empty( $r['ok'] ) ) return [ 'id' => $id, 'outcome' => 'failed', 'error' => (string) ( $r['error'] ?? 'Unknown error' ) ];
        return $revert
            ? [ 'id' => $id, 'outcome' => 'reverted' ]
            : [ 'id' => $id, 'outcome' => 'applied', 'before' => (string) ( $r['before'] ?? '' ) ];
    } catch ( \Throwable $e ) {
        return [ 'id' => $id, 'outcome' => 'failed', 'error' => substr( $e->getMessage(), 0, 300 ) ];
    }
}

// ── front-end output for sites with no SEO plugin ────────────────────────

function od_overlay_value( $field ) {
    if ( od_seo_adapter() !== 'overlay' || ! is_singular() ) return null;
    $id = get_queried_object_id();
    if ( ! $id ) return null;
    $v = get_post_meta( $id, od_meta_key( $field, 'overlay' ), true );
    return ( is_string( $v ) && $v !== '' ) ? $v : null;
}

add_filter( 'pre_get_document_title', function ( $title ) {
    $v = od_overlay_value( 'meta_title' );
    return $v !== null ? $v : $title;
}, 999 );

add_action( 'wp_head', function () {
    $v = od_overlay_value( 'meta_desc' );
    if ( $v !== null ) echo '<meta name="description" content="' . esc_attr( $v ) . '">' . "\n";
}, 1 );

add_filter( 'get_canonical_url', function ( $url ) {
    $v = od_overlay_value( 'canonical' );
    return $v !== null ? $v : $url;
}, 999 );
