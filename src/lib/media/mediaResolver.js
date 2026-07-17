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

  const appStore = useAppStore.getState();
  const playerStore = usePlayerStore.getState();

  // Explicitly lock immersive mode for the player
  appStore.setIsImmersivePlayer(true);

  switch (mediaItem.type) {
    case 'movie':
    case 'series':
      // For VOD/Series, we use the player overlay/view mechanism
      // Ensure the correct view is active if we want to show the VODDetailOverlay,
      // or just play the stream if VOD playback uses the same PlayerPreview
      appStore.setCurrentView('player');
      playerStore.setChannel(mediaItem);
      break;
    case 'live':
    default:
      appStore.setCurrentView('player');
      appStore.setSelectedChannel(mediaItem);
      playerStore.setChannel(mediaItem);
      break;
  }
}
