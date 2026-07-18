/**
 * electron/shared/mediaKeys.mjs
 *
 * Stable, content-derived identifiers for M3U-sourced VOD/series rows.
 * M3U entries carry no provider IDs, so keys are hashed from content:
 * stable across resyncs, independent of insertion order.
 */

/** djb2 hash, unsigned, fixed-width hex. */
export function contentHash(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** stream_id for an M3U movie row, derived from its stream URL. */
export function m3uStreamId(url) {
  return `m3u-${contentHash(url)}`;
}

/** series_id / series_key for an M3U show, derived from its normalized name. */
export function m3uSeriesKey(showName) {
  const norm = String(showName || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return `m3u-show-${contentHash(norm)}`;
}
