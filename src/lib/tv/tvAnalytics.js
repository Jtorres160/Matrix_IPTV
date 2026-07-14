import { logger } from '../logger.js';

export const tvEvents = {
  CHANNEL_PLAY: 'CHANNEL_PLAY',
  CHANNEL_SWITCH: 'CHANNEL_SWITCH',
  CHANNEL_SWITCH_STARTED: 'CHANNEL_SWITCH_STARTED',
  CHANNEL_SWITCH_COMPLETED: 'CHANNEL_SWITCH_COMPLETED',
  GUIDE_OPEN: 'GUIDE_OPEN',
  FAVORITE_ADD: 'FAVORITE_ADD',
  WATCH_SESSION_START: 'WATCH_SESSION_START',
  WATCH_SESSION_END: 'WATCH_SESSION_END',
  PLAYER_READY: 'PLAYER_READY',
  PLAYBACK_STARTED: 'PLAYBACK_STARTED',
  PLAYBACK_PAUSED: 'PLAYBACK_PAUSED'
};

class TVAnalytics {
  constructor() {
    this.subscribers = [];
    this.lastEventCache = new Map();
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  track(type, payload = {}) {
    const { channelId, ...metadata } = payload;
    const cacheKey = `${type}-${channelId || 'global'}`;
    const now = Date.now();

    // Deduplication window: 500ms
    if (this.lastEventCache.has(cacheKey)) {
      const lastTimestamp = this.lastEventCache.get(cacheKey);
      if (now - lastTimestamp < 500) {
        return; // Skip duplicate event
      }
    }

    this.lastEventCache.set(cacheKey, now);

    const eventData = {
      type,
      channelId,
      timestamp: now,
      metadata
    };
    logger.debug(`[TV Analytics] ${type}`, eventData);
    this.subscribers.forEach(cb => cb(eventData));
  }
}

export const analytics = new TVAnalytics();
