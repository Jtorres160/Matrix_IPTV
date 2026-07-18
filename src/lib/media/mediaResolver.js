/**
 * src/lib/media/mediaResolver.js
 * 
 * Resolves legacy IDs (e.g. from favorites or watch history) into their true MediaItem
 * representations by searching across categorized app state or invoking the DB.
 */

import { useAppStore } from '../../store/appStore.js';
import { usePlayerStore } from '../../player/playerStore.js';
import { toMediaItem } from './mediaAdapter.js';

/**
 * Resolves a channel ID (legacy or new) to a MediaItem.
 * Currently searches the renderer's appStore categorized media.
 * 
 * @param {string|number} id The favorite or watch history ID
 * @returns {Object|null} A MediaItem or null if not found
 */
export function resolveMediaItem(id) {
  if (id == null) return null;
  const targetId = String(id);

  const { media } = useAppStore.getState();
  if (!media) return null;

  // Search Live
  let match = media.live.find(item => String(item.id) === targetId);
  if (match) return match;

  // Search Movies
  match = media.movies.find(item => String(item.id) === targetId);
  if (match) return match;

  // Search Series
  match = media.series.find(item => String(item.id) === targetId);
  if (match) return match;

  return null;
}

/**
 * Convenience helper to determine the correct view/player mode for an item.
 * 
 * @param {Object} mediaItem 
 * @returns {'live-tv' | 'movies' | 'series'} The routing target
 */
export function getRouteForMediaItem(mediaItem) {
  if (!mediaItem || !mediaItem.type) return 'live-tv';
  switch (mediaItem.type) {
    case 'movie': return 'movies';
    case 'series': return 'series';
    case 'live':
    default:
      return 'live-tv';
  }
}

/**
 * Routes playback based on the media type.
 * 
 * @param {Object} mediaItem The resolved MediaItem
 */
export function playMediaItem(mediaItem) {
  if (!mediaItem) return;

  // Fresh marks for the player-switch / channel-change perf measures.
  // Set here (the single playback entry point) so plays started from
  // Movies/Series don't measure against a stale mark from Live TV.
  try {
    performance.mark('player-mode-enter');
    performance.mark('channel-change-start');
  } catch (e) { /* perf API unavailable */ }

  const appStore = useAppStore.getState();
  const playerStore = usePlayerStore.getState();

  // Explicitly lock immersive mode for the player
  appStore.setIsImmersivePlayer(true);

  switch (mediaItem.type) {
    case 'series':
      // For series the caller (playSeriesEpisode) has already set the autoplay
      // queue; don't clear it here.
      appStore.setCurrentView('player');
      playerStore.setChannel(mediaItem);
      break;
    case 'movie':
      // A one-off movie has no episode queue.
      playerStore.setSeriesQueue([], -1);
      appStore.setCurrentView('player');
      playerStore.setChannel(mediaItem);
      break;
    case 'live':
    default:
      playerStore.setSeriesQueue([], -1);
      appStore.setCurrentView('player');
      appStore.setSelectedChannel(mediaItem);
      playerStore.setChannel(mediaItem);
      break;
  }
}

/**
 * Plays a specific episode of a grouped show, arming autoplay for the rest of
 * the show (across seasons, in order) and recording it in watch history.
 *
 * @param {Object} show    A show object from groupSeries() (has ordered .episodes)
 * @param {Object} episode The episode MediaItem to start on
 */
export function playSeriesEpisode(show, episode) {
  if (!episode) return;
  const playerStore = usePlayerStore.getState();
  const queue = (show && Array.isArray(show.episodes) && show.episodes.length > 0)
    ? show.episodes
    : [episode];
  const index = Math.max(0, queue.findIndex((e) => String(e.id) === String(episode.id)));
  playerStore.setSeriesQueue(queue, index);
  playMediaItem({ ...episode, type: 'series' });
}
