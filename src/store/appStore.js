import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // View State
  currentView: 'live-tv',
  setCurrentView: (view) => set({ currentView: view }),

  // Playlist State
  channels: [],
  categories: [],
  activeCategory: null,
  selectedChannel: null,
  selectedChannelId: null, // Track by ID to avoid stale object references
  isLoadingPlaylist: false,
  playlistMessage: '',
  searchTerm: '',

  setChannels: (channels) => set({ channels }),
  setCategories: (categories) => set({ categories }),
  setActiveCategory: (category) => set({ activeCategory: category }),
  setSelectedChannel: (channel) => set({ 
    selectedChannel: channel,
    selectedChannelId: channel?.id || null 
  }),
  setIsLoadingPlaylist: (isLoading) => set({ isLoadingPlaylist: isLoading }),
  setPlaylistMessage: (msg) => set({ playlistMessage: msg }),
  setSearchTerm: (term) => set({ searchTerm: term }),

  // EPG State
  epgUrl: null,
  epgData: new Map(), // Map of channelId -> Array of programs
  isLoadingEpg: false,

  setEpgUrl: (url) => set({ epgUrl: url }),
  setEpgData: (epgData) => set({ epgData }),
  setIsLoadingEpg: (isLoading) => set({ isLoadingEpg: isLoading }),

  // Reset function
  resetVolatileState: () => set({
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
