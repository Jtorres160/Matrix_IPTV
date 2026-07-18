/**
 * src/lib/media/dbSeriesAdapter.js
 *
 * Builds grouped Show objects (the exact shape groupSeries emits) from the
 * SQLite series + series_episodes tables written by M3U ingestion, so
 * SeriesDetailOverlay / playSeriesEpisode work unchanged on DB-backed data.
 */

import { toMediaItem } from './mediaAdapter.js';

/**
 * @param {Array<Object>} seriesRows   Rows from the `series` table (show metadata)
 * @param {Array<Object>} episodeRows  Rows from `series_episodes`
 * @param {string} playlistId
 * @returns {Array<Object>} Shows sorted by name — same shape as groupSeries()
 */
export function buildShowsFromDbEpisodes(seriesRows, episodeRows, playlistId) {
  const meta = new Map((seriesRows || []).map((r) => [String(r.series_id), r]));
  const shows = new Map();

  for (const row of episodeRows || []) {
    const key = String(row.series_key);
    if (!shows.has(key)) {
      const m = meta.get(key);
      shows.set(key, {
        key,
        show: (m && m.name) || row.name || 'Unknown Show',
        poster: (m && m.cover) || row.logo || null,
        group: row.group_title || 'Series',
        seasons: new Map(),
        episodes: [],
      });
    }
    const showObj = shows.get(key);
    if (!showObj.poster && row.logo) showObj.poster = row.logo;

    const mediaItem = toMediaItem({ ...row, type: 'series' }, playlistId);
    const epObj = {
      ...mediaItem,
      _season: row.season ?? 1,
      _episode: row.episode ?? 0,
      _epTitle: row.title || '',
    };
    showObj.episodes.push(epObj);
    if (!showObj.seasons.has(epObj._season)) showObj.seasons.set(epObj._season, []);
    showObj.seasons.get(epObj._season).push(epObj);
  }

  for (const showObj of shows.values()) {
    for (const eps of showObj.seasons.values()) eps.sort((a, b) => a._episode - b._episode);
    showObj.episodes.sort((a, b) => a._season - b._season || a._episode - b._episode);
    showObj.seasonNumbers = [...showObj.seasons.keys()].sort((a, b) => a - b);
    showObj.episodeCount = showObj.episodes.length;
  }

  return [...shows.values()].sort((a, b) => a.show.localeCompare(b.show));
}
