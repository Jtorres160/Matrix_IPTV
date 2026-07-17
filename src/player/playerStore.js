import { create } from 'zustand';
import { analytics, tvEvents } from '../lib/tv/tvAnalytics.js';

let controlsTimeout = null;
let retryTimeout = null;

export const usePlayerStore = create((set, get) => ({
  // Core State
  activeChannel: null,
  activeUrl: null,
  playbackState: 'idle', // 'idle', 'playing', 'paused', 'buffering', 'error'
  isFullscreen: false,
  currentMode: 'normal', // 'normal', 'theater', 'mini'
  
  // UI State
  showControls: false,
  errorInfo: null,
  retryCount: 0,
  reconnecting: false,

  // A/V State
  volume: 1,
  muted: false,

  // Video sizing: how the picture fills the frame. Cycled by the aspect control
  // / 'a' key. 'contain' = fit (letterbox), 'cover' = fill (crop), 'fill' =
  // stretch.
  videoFit: 'contain',

  // VOD (recorded-file) playback: real duration/position + one-shot seek target.
  isVOD: false,
  duration: 0,
  currentTime: 0,
  seekRequest: null, // seconds; MpegtsPlayer consumes then clears via clearSeekRequest

  // Live handles to the underlying media element / hls.js instance, published
  // by PlayerPreview on ready so the track menu can enumerate + switch audio and
  // subtitle tracks. Non-reactive; read on demand.
  mediaHandles: null,

  // Channels Array (for previous/next navigation)
  playlist: [],

  // Series autoplay: an ordered queue of episodes + the current index. Set when
  // playback starts from a series, consumed by onEnded to roll to the next
  // episode. Empty for live/movie playback.
  seriesQueue: [],
  seriesIndex: -1,

  // --- ACTIONS ---

  setPlaylist: (channels) => set({ playlist: channels }),

  setSeriesQueue: (queue, index) => set({
    seriesQueue: Array.isArray(queue) ? queue : [],
    seriesIndex: typeof index === 'number' ? index : -1,
  }),

  // Advance to the next episode in the series queue. Returns true if it did.
  playNextInSeries: () => {
    const { seriesQueue, seriesIndex } = get();
    if (seriesIndex >= 0 && seriesIndex < seriesQueue.length - 1) {
      const next = seriesQueue[seriesIndex + 1];
      set({ seriesIndex: seriesIndex + 1 });
      get().setChannel(next);
      return true;
    }
    return false;
  },

  setChannel: (channel) => {
    // Clear any pending retry loops
    if (retryTimeout) clearTimeout(retryTimeout);

    // Remember the last channel for "resume on launch" (Settings > Playback)
    try {
      if (channel?.id != null) localStorage.setItem('matrix_last_channel_id', String(channel.id));
    } catch (e) { /* storage unavailable — non-fatal */ }

    set({
      activeChannel: channel,
      activeUrl: channel.url,
      playbackState: 'buffering',
      errorInfo: null,
      retryCount: 0,
      reconnecting: false,
      isVOD: !!channel.isRecording || channel.type === 'movie' || channel.type === 'series',
      duration: 0,
      currentTime: 0,
      seekRequest: null
    });
    get().showControlsTemporarily();
  },

  setDuration: (sec) => set({ duration: Number.isFinite(sec) ? sec : 0 }),
  setCurrentTime: (sec) => set({ currentTime: Number.isFinite(sec) ? sec : 0 }),
  seek: (sec) => {
    const { duration } = get();
    const clamped = Math.max(0, Math.min(sec, duration || sec));
    set({ seekRequest: clamped, currentTime: clamped });
    get().showControlsTemporarily();
  },
  clearSeekRequest: () => set({ seekRequest: null }),

  setVideoFit: (fit) => set({ videoFit: fit }),
  cycleVideoFit: () => {
    const order = ['contain', 'cover', 'fill'];
    const i = order.indexOf(get().videoFit);
    set({ videoFit: order[(i + 1) % order.length] });
    get().showControlsTemporarily();
  },

  setMediaHandles: (handles) => set({ mediaHandles: handles }),

  setPlaybackState: (state) => {
    const { playbackState, activeChannel } = get();
    if (state !== playbackState) {
      if (state === 'playing') {
        // A successful play clears any reconnect state so a later drop starts a
        // fresh backoff cycle.
        if (get().retryCount !== 0 || get().reconnecting) set({ retryCount: 0, reconnecting: false });
        analytics.track(tvEvents.PLAYBACK_STARTED, { channelId: activeChannel?.id });
        if (playbackState === 'buffering' || playbackState === 'idle') {
           analytics.track(tvEvents.CHANNEL_SWITCH_COMPLETED, { channelId: activeChannel?.id });
        }
      } else if (state === 'paused') {
        analytics.track(tvEvents.PLAYBACK_PAUSED, { channelId: activeChannel?.id });
      }
      set({ playbackState: state });
    }
  },

  play: () => get().setPlaybackState('playing'),
  pause: () => get().setPlaybackState('paused'),

  toggleFullscreen: () => {
    const isFull = !get().isFullscreen;
    set({ isFullscreen: isFull });
  },

  setFullscreen: (val) => set({ isFullscreen: val }),

  setMode: (mode) => set({ currentMode: mode }),

  toggleTheater: () => {
    const { currentMode } = get();
    set({ currentMode: currentMode === 'theater' ? 'normal' : 'theater' });
  },

  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
  
  toggleMute: () => set((state) => ({ muted: !state.muted })),

  // --- CONTROLS LOGIC ---
  
  showControlsTemporarily: () => {
    set({ showControls: true });
    if (controlsTimeout) clearTimeout(controlsTimeout);
    
    controlsTimeout = setTimeout(() => {
      // Only hide if we are playing. If paused or errored, keep them up.
      const { playbackState } = get();
      if (playbackState === 'playing') {
        set({ showControls: false });
      }
    }, 3000);
  },

  forceShowControls: () => {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    set({ showControls: true });
  },

  // --- RETRY LOGIC ---

  // Auto-reconnect with backoff. Live streams drop routinely (provider hiccups,
  // network blips); rather than dead-ending after two tries, keep reconnecting a
  // few times with growing delays before giving up. A successful play resets the
  // counter (see setPlaybackState).
  handleError: () => {
    const { retryCount, activeUrl } = get();
    if (retryTimeout) clearTimeout(retryTimeout);

    const MAX_RECONNECTS = 6;
    const next = retryCount + 1;

    if (next <= MAX_RECONNECTS) {
      const delay = Math.min(2000 * next, 15000); // 2s, 4s, … capped at 15s
      set({ playbackState: 'error', reconnecting: true, retryCount: next,
            errorInfo: `Reconnecting… (${next}/${MAX_RECONNECTS})` });
      retryTimeout = setTimeout(() => {
        // Force a reload by clearing then re-setting the URL.
        set({ activeUrl: null });
        setTimeout(() => set({ activeUrl }), 120);
      }, delay);
    } else {
      set({ playbackState: 'error', reconnecting: false,
            errorInfo: 'Unable to play this channel. The stream may be offline.' });
    }
  },

  // --- NAVIGATION ---

  previousChannel: () => {
    const { playlist, activeChannel } = get();
    if (!activeChannel || playlist.length === 0) return;
    
    const currentIndex = playlist.findIndex(c => c.id === activeChannel.id);
    if (currentIndex > 0) {
      get().setChannel(playlist[currentIndex - 1]);
    } else {
      // Wrap around
      get().setChannel(playlist[playlist.length - 1]);
    }
  },

  nextChannel: () => {
    const { playlist, activeChannel } = get();
    if (!activeChannel || playlist.length === 0) return;
    
    const currentIndex = playlist.findIndex(c => c.id === activeChannel.id);
    if (currentIndex < playlist.length - 1) {
      get().setChannel(playlist[currentIndex + 1]);
    } else {
      // Wrap around
      get().setChannel(playlist[0]);
    }
  }
}));
