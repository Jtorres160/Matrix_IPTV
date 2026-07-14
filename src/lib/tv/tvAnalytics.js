export const tvEvents = {
  CHANNEL_PLAY: 'CHANNEL_PLAY',
  CHANNEL_SWITCH: 'CHANNEL_SWITCH',
  GUIDE_OPEN: 'GUIDE_OPEN',
  FAVORITE_ADD: 'FAVORITE_ADD',
  WATCH_SESSION_START: 'WATCH_SESSION_START',
  WATCH_SESSION_END: 'WATCH_SESSION_END'
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

  track(event, payload) {
    const eventData = {
      event,
      timestamp: Date.now(),
      ...payload
    };
    console.log(`[TV Analytics] ${event}`, eventData);
    this.subscribers.forEach(cb => cb(eventData));
  }
}

export const analytics = new TVAnalytics();
