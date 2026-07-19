/**
 * src/lib/media/playableItem.js
 *
 * Normalizes a VOD card (DB vod_streams row OR in-memory store MediaItem) into
 * something playMediaItem can always play. DB rows carry stream_url/stream_icon
 * but no url/type/logo — the player and PlayerOverlay read url, type, and logo.
 */

/**
 * @param {Object} item        The clicked card (DB row or MediaItem)
 * @param {string} [resolvedUrl] URL already resolved by the detail overlay; wins when present
 * @returns {Object} A MediaItem-shaped object safe to hand to playMediaItem
 */
export function toPlayableVodItem(item, resolvedUrl) {
  const url = resolvedUrl || item.streamUrl || item.url || item.stream_url;
  return {
    ...item,
    ...(url ? { url } : {}),
    type: item.type || 'movie',
    logo: item.logo || item.stream_icon || null,
  };
}
