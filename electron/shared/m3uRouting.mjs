/**
 * electron/shared/m3uRouting.mjs
 *
 * Routes parsed M3U entries into their SQLite destinations using the SAME
 * classifier the renderer uses (single source of truth — see mediaClassifier).
 * Called by syncM3UPlaylist in the main process.
 */

import { classifyMedia } from './mediaClassifier.mjs';
import { parseEpisode } from './seriesGrouping.mjs';
import { m3uStreamId, m3uSeriesKey } from './mediaKeys.mjs';

// Same threshold toMediaItem (renderer) uses to demote weak guesses to
// 'unsorted': below it an entry stays a live channel, exactly as today.
const MIN_CONFIDENCE = 0.5;

/**
 * @param {Array<Object>} parsedChannels parseM3UChannels output
 * @returns {{ liveChannels: Array, vodRows: Array, seriesRows: Array, episodeRows: Array }}
 */
export function routeM3UItems(parsedChannels) {
  const liveChannels = [];
  const vodRows = [];
  const seriesRowsByKey = new Map();
  const episodeRows = [];

  for (const ch of parsedChannels || []) {
    const { type, confidence } = classifyMedia(ch);

    if (type === 'movie' && confidence >= MIN_CONFIDENCE) {
      vodRows.push({
        stream_id: m3uStreamId(ch.stream_url),
        name: ch.name,
        stream_icon: ch.logo || null,
        category_id: null,
        group_title: ch.group_title || 'Uncategorized',
        rating: 0,
        added: null,
        container_extension: null,
        stream_url: ch.stream_url,
      });
      continue;
    }

    if (type === 'series' && confidence >= MIN_CONFIDENCE) {
      const parsed = parseEpisode(ch.name);
      const show = parsed ? parsed.show : (ch.name || 'Unknown Show');
      const key = m3uSeriesKey(show);

      if (!seriesRowsByKey.has(key)) {
        seriesRowsByKey.set(key, {
          series_id: key,
          name: show,
          cover: ch.logo || null,
          plot: null,
          category_id: null,
          group_title: ch.group_title || 'Uncategorized',
          rating: 0,
          releaseDate: null,
        });
      } else if (!seriesRowsByKey.get(key).cover && ch.logo) {
        seriesRowsByKey.get(key).cover = ch.logo;
      }

      episodeRows.push({
        series_key: key,
        season: parsed ? parsed.season : 1,
        episode: parsed ? parsed.episode : 0,
        name: ch.name,
        title: parsed ? parsed.epTitle : '',
        stream_url: ch.stream_url,
        logo: ch.logo || null,
        group_title: ch.group_title || 'Uncategorized',
      });
      continue;
    }

    liveChannels.push(ch);
  }

  return { liveChannels, vodRows, seriesRows: [...seriesRowsByKey.values()], episodeRows };
}
