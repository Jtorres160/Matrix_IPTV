/**
 * src/lib/media/mediaAdapter.js
 * 
 * Adapts raw DB rows (from channels, vod_streams, series) or parsed renderer items
 * into a unified MediaItem format.
 */

import { classifyMedia } from './mediaClassifier.js';
import { parseEpisode, seriesCategory } from './seriesGrouping.js';

/**
 * Normalizes a raw media object into a standard MediaItem shape.
 * 
 * @param {Object} raw - The raw item from DB or parser
 * @param {string} playlistId - The playlist this item belongs to
 * @returns {Object} MediaItem
 */
export function toMediaItem(raw, playlistId) {
  if (!raw) return null;

  const classification = classifyMedia(raw);
  const type = classification.confidence < 0.5 ? 'unsorted' : classification.type;
  
  // Try to determine the primary ID
  const dbId = raw.id; // Usually the SQLite auto-increment ID
  const streamId = raw.stream_id || raw.series_id || raw.tvg_id || raw.streamId || raw.id;

  // Prefer streamId for string ID if available and valid, otherwise fallback to dbId as string
  const idStr = streamId ? String(streamId) : (dbId ? String(dbId) : null);

  const title = raw.name || raw.title || 'Unknown Media';
  const streamUrl = raw.stream_url || raw.streamUrl || raw.url || '';

  // Groups: keep the renderer's array shape as source of truth. DB rows only
  // have a flat group string, so wrap it.
  let groups = Array.isArray(raw.groups) && raw.groups.length > 0
    ? raw.groups
    : [raw.group_title || raw.group || raw.groupTitle || 'Uncategorized'].filter(Boolean);
  let group = groups[0] || 'Uncategorized';

  // Series whose group-title is the show's own name (one category per show)
  // collapse into a single "TV Shows" category — mirrors m3uRouting so the
  // renderer store path and the SQLite path agree on category names.
  if (type === 'series') {
    const parsed = parseEpisode(title);
    const collapsed = seriesCategory(group, parsed ? parsed.show : null);
    if (collapsed !== group) {
      group = collapsed;
      groups = [collapsed];
    }
  }

  const tvgId = raw.tvgId || raw.tvg_id || null;
  const logo = raw.logo || raw.stream_icon || null;
  const poster = raw.cover || raw.stream_icon || logo || null;

  // Extract metadata if available
  const metadata = {
    rating: raw.rating || 0,
    added: raw.added || null,
    releaseDate: raw.releaseDate || null,
    plot: raw.plot || null,
    containerExtension: raw.container_extension || null,
  };

  return {
    id: idStr,
    dbId: dbId,
    playlistId: playlistId,
    type: type,
    confidence: classification.confidence,
    title: title,
    streamUrl: streamUrl,
    logo: logo,
    poster: poster,
    group: group,
    groups: groups,
    metadata: metadata,

    // ── Legacy aliases ───────────────────────────────────────────────────
    // The entire existing UI (LiveTVView, playerStore, EPG, favorites,
    // channel ranking) reads channels as { name, url, groups, tvgId }.
    // Keep those fields populated until every consumer is migrated to the
    // MediaItem shape — removing them blanks out the whole app.
    name: title,
    url: streamUrl,
    tvgId: tvgId,
    status: raw.status || 'LIVE'
  };
}
