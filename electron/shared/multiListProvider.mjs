/**
 * electron/shared/multiListProvider.mjs
 *
 * Some (non-Xtream) panels serve live TV, movies and TV shows as three
 * separate M3U lists at sibling URLs, e.g.
 *   https://host/api/list/<user>/<pass>/<format>/livetv
 *   https://host/api/list/<user>/<pass>/<format>/movies
 *   https://host/api/list/<user>/<pass>/<format>/tvshows
 * Users typically save only the livetv URL, so their movies/series never
 * enter the app. This helper expands such a URL into every list the account
 * offers; the siblings are best-effort (a live-only account just 404s them).
 */

const MULTI_LIST_RE = /^(https?:\/\/[^?#]+\/api\/list\/[^/?#]+\/[^/?#]+\/[^/?#]+)\/livetv\/?$/i;

/**
 * @param {string} url Saved playlist URL
 * @returns {Array<{url: string, kind: 'any'|'live'|'movies'|'tvshows', required: boolean}>}
 *   Always at least [{url, kind:'any', required:true}]. For a recognized
 *   multi-list livetv URL: the original (required) plus movies/tvshows
 *   siblings (optional — fetch failures must be non-fatal).
 */
export function expandPlaylistUrls(url) {
  const m = MULTI_LIST_RE.exec(String(url || '').trim());
  if (!m) return [{ url, kind: 'any', required: true }];
  const base = m[1];
  return [
    { url: `${base}/livetv`, kind: 'live', required: true },
    { url: `${base}/movies`, kind: 'movies', required: false },
    { url: `${base}/tvshows`, kind: 'tvshows', required: false },
  ];
}
