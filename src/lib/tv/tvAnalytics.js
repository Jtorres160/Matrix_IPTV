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
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  track(type, payload = {}) {
    const { channelId, ...metadata } = payload;
    const eventData = {
      type,
      channelId,
      timestamp: Date.now(),
      metadata
    };
    console.log(`[TV Analytics] ${type}`, eventData);
    this.subscribers.forEach(cb => cb(eventData));
  }
}

export const analytics = new TVAnalytics();
