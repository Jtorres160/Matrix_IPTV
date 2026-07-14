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
  
  // A/V State
  volume: 1,
  muted: false,

  // Channels Array (for previous/next navigation)
  playlist: [],

  // --- ACTIONS ---

  setPlaylist: (channels) => set({ playlist: channels }),

  setChannel: (channel) => {
    // Clear any pending retry loops
    if (retryTimeout) clearTimeout(retryTimeout);

    set({
      activeChannel: channel,
      activeUrl: channel.url,
      playbackState: 'buffering',
      errorInfo: null,
      retryCount: 0
    });
    get().showControlsTemporarily();
  },

  setPlaybackState: (state) => {
    const { playbackState, activeChannel } = get();
    if (state !== playbackState) {
      if (state === 'playing') {
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

  handleError: () => {
    const { retryCount, activeUrl } = get();
    
    if (retryTimeout) clearTimeout(retryTimeout);
    
    if (retryCount === 0) {
      set({ playbackState: 'error', errorInfo: 'Retrying... (1/2)', retryCount: 1 });
      retryTimeout = setTimeout(() => {
        // Trigger a reload by clearing and re-setting the URL
        set({ activeUrl: null });
        setTimeout(() => set({ activeUrl }), 100);
      }, 2000);
    } 
    else if (retryCount === 1) {
      set({ playbackState: 'error', errorInfo: 'Retrying... (2/2)', retryCount: 2 });
      retryTimeout = setTimeout(() => {
        set({ activeUrl: null });
        setTimeout(() => set({ activeUrl }), 100);
      }, 5000);
    } 
    else {
      set({ playbackState: 'error', errorInfo: 'Unable to play channel. Please try another stream.' });
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
