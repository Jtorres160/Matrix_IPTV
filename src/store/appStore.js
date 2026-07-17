import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // View State
  currentView: 'live-tv',
  setCurrentView: (view) => set({ currentView: view }),

  // Playlist State
  media: {
    live: [],
    movies: [],
    series: [],
    unsorted: []
  },
  channels: [], // Temporarily kept as alias for media.live to avoid breaking legacy UI
  categories: [],
  activeCategory: null,
  selectedChannel: null,
  selectedChannelId: null, // Track by ID to avoid stale object references
  isLoadingPlaylist: false,
  playlistMessage: '',
  searchTerm: '',

  setMediaState: (mediaItems) => {
    const media = { live: [], movies: [], series: [], unsorted: [] };
    mediaItems.forEach(item => {
      if (item.type === 'movie') media.movies.push(item);
      else if (item.type === 'series') media.series.push(item);
      else if (item.type === 'unsorted') media.unsorted.push(item);
      else media.live.push(item);
    });
    // Unsorted items must stay reachable somewhere; until they get their own
    // view, surface them in Live TV rather than dropping them entirely.
    set({ media, channels: media.live.concat(media.unsorted) });
  },

  setChannels: (channels) => set({ channels }),
  setCategories: (categories) => set({ categories }),
  setActiveCategory: (category) => set({ activeCategory: category }),
  setSelectedChannel: (channel) => set({ 
    selectedChannel: channel,
    selectedChannelId: channel?.id || null 
  }),
  setIsLoadingPlaylist: (isLoading) => set({ isLoadingPlaylist: isLoading }),
  // Accepts a string or an updater function (callers use both forms)
  setPlaylistMessage: (msg) => set((state) => ({
    playlistMessage: typeof msg === 'function' ? msg(state.playlistMessage || '') : msg
  })),
  setSearchTerm: (term) => set({ searchTerm: term }),

  // Explicit layout lock for player
  isImmersivePlayer: false,
  setIsImmersivePlayer: (isImmersive) => set({ isImmersivePlayer: isImmersive }),

  // Player dock: 'full' = background layer, 'preview' = docked preview box
  // (only honored by the Channels browser view)
  playerDock: 'full',
  setPlayerDock: (dock) => set({ playerDock: dock }),

  // EPG State
  epgUrl: null,
  epgData: new Map(), // Map of channelId -> Array of programs
  isLoadingEpg: false,

  setEpgUrl: (url) => set({ epgUrl: url }),
  setEpgData: (epgData) => set({ epgData }),
  setIsLoadingEpg: (isLoading) => set({ isLoadingEpg: isLoading }),

  // Reset function
  resetVolatileState: () => set({
    media: { live: [], movies: [], series: [], unsorted: [] },
    channels: [],
    categories: [],
    activeCategory: null,
    selectedChannel: null,
    selectedChannelId: null,
    epgUrl: null,
    epgData: new Map(),
    searchTerm: ''
  })
}));
