import React, { useState, useEffect } from "react";
import { useActiveSettings, useActiveProfile, useProfilesStore } from "./store/profileStore";
import { useAppStore } from "./store/appStore.js";
import { fetchAndParseEPG } from "./services/epgParser.js";
import { loadPlaylist as fetchPlaylist } from "./lib/m3u/playlistService.js";
import { getPlaylistFromCache, savePlaylistToCache } from "./lib/m3u/playlistCache.js";

import BottomNavigationBar from "./components/BottomNavigationBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import useMediaKeys from "./hooks/useMediaKeys.js";
import GlobalLoader from "./components/GlobalLoader.jsx";
import ViewRouter from "./components/ViewRouter.jsx";
import PlayerPreview from "./components/PlayerPreview.jsx";
import SettingsDrawer from "./components/SettingsDrawer.jsx";

export default function App() {
  useMediaKeys();

  const activeSettings = useActiveSettings();
  const activeProfile = useActiveProfile();
  const updateSettings = useProfilesStore((s) => s.updateSettings);
  const addPlaylistToProfile = useProfilesStore((s) => s.addPlaylist);
  const removePlaylistFromProfile = useProfilesStore((s) => s.removePlaylist);
  const updatePlaylist = useProfilesStore((s) => s.updatePlaylist);

  const darkMode = activeSettings?.theme === 'dark';
  const playerPreference = activeSettings?.playerPreference || 'internal';
  const autoRefresh = !!activeSettings?.autoRefresh;

  // Modals and UI overlays
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // App Store bindings
  const {
    currentView,
    setCurrentView,
    setChannels,
    setCategories,
    setActiveCategory,
    setSelectedChannel,
    setEpgData,
    setEpgUrl,
    epgUrl,
    setIsLoadingPlaylist,
    setPlaylistMessage,
    setIsLoadingEpg,
    isLoadingPlaylist,
    isLoadingEpg,
    playlistMessage,
    resetVolatileState
  } = useAppStore();

  useEffect(() => {
    const lastView = localStorage.getItem('matrix_last_view');
    if (lastView) {
      setCurrentView(lastView);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('matrix_last_view', currentView);

    if (currentView === 'player') {
      try {
        performance.measure("player-switch", "player-mode-enter");
        const entry = performance.getEntriesByName("player-switch").pop();
        if (entry) {
          console.log(`[Performance] Switch to Player Mode: ${entry.duration.toFixed(2)}ms`);
          if (window.electronLog) window.electronLog.write('info', `[Performance] [player-switch] ${entry.duration.toFixed(2)}ms`);
        }
      } catch (e) {
        // mark might not exist on direct launch
      }
    }
  }, [currentView]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        console.log("[Matrix_IPTV] Auto-refresh triggered.");
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const activePlaylistUrl = activeProfile?.playlists?.[0]?.url;

  // Handle Profile Switch or Main Playlist Change
  useEffect(() => {
    resetVolatileState();

    if (activeProfile && activeProfile.playlists && activeProfile.playlists[0]) {
      const playlist = activeProfile.playlists[0];
      if (playlist.type === 'm3u') {
        loadM3UPlaylist(playlist);
      }
    }
  }, [activeProfile?.id, activePlaylistUrl]);

  // Handle EPG Fetching
  useEffect(() => {
    async function loadEPG() {
      if (!epgUrl) {
        setEpgData(new Map());
        return;
      }
      setIsLoadingEpg(true);
      setPlaylistMessage(prev => prev + ' Loading EPG...');
      console.log(`[Matrix_IPTV] Fetching EPG from: ${epgUrl}`);
      try {
        const epg = await fetchAndParseEPG(epgUrl);
        setEpgData(epg);
        setPlaylistMessage(prev => prev.replace('Loading EPG...', `Loaded EPG for ${epg.size} channels.`));
        console.log(`[Matrix_IPTV] EPG loaded for ${epg.size} channels.`);
      } catch (err) {
        setPlaylistMessage(prev => prev.replace('Loading EPG...', 'Failed to load EPG.'));
      } finally {
        setIsLoadingEpg(false);
      }
    }
    loadEPG();
  }, [epgUrl]);

  // M3U Loading Logic
  async function loadM3UPlaylist(playlist) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    
    // Check Cache
    const cached = await getPlaylistFromCache(playlist.url);
    if (cached) {
      setEpgUrl(cached.epgUrl);
      setChannels(cached.channels);
      setCategories(cached.categories);
      setActiveCategory(null);
      setSelectedChannel(null);
      setIsLoadingPlaylist(false);
      setPlaylistMessage(`Loaded ${cached.channelCount} channels from cache.`);
      
      // Silently refresh in background
      refreshPlaylist(playlist, true);
    } else {
      // No cache, block and load
      refreshPlaylist(playlist, false);
    }
  }

  async function refreshPlaylist(playlist, silent) {
    if (!silent) {
       setPlaylistMessage("Loading " + (playlist.name || 'playlist') + "...");
       setIsLoadingPlaylist(true);
    }
    
    const ac = new AbortController();
    const result = await fetchPlaylist(playlist.url, ac.signal, (state, msg) => {
       if (!silent) setPlaylistMessage(msg);
    });
    
    if (result.success) {
       await savePlaylistToCache(playlist.url, result);
       
       // If silent and the view is Live TV, we can optionally update it.
       // However, updating channels while the user is watching could be disruptive if the channel list completely re-renders.
       // For now, we will update it so they have fresh channels.
       setEpgUrl(result.epgUrl);
       setChannels(result.channels);
       setCategories(result.categories);
       if (!silent) {
         setPlaylistMessage(`Found ${result.channelCount} channels.`);
         setIsLoadingPlaylist(false);
       }
       
       updatePlaylist(playlist.id, {
         status: 'ready',
         channelCount: result.channelCount,
         lastUpdated: Date.now(),
         lastError: null
       });

       // ── Phase 1B: keep SQLite (Path B) in sync on startup/background refresh ─
       // Fire-and-forget: this must NOT block Live TV rendering. The renderer
       // pipeline above is the source of truth for the current view; SQLite is
       // updated in the background for VOD/Series/DB-search. Errors are logged
       // only, never surfaced.
       if (typeof window !== 'undefined' && window.electronDB && playlist.id) {
         window.electronDB
           .syncPlaylist(playlist.id)
           .catch((dbErr) => console.error('[Matrix_IPTV] Background SQLite resync failed (non-fatal):', dbErr));
       }
    } else {
       if (!silent) {
         setPlaylistMessage(`Failed to load ${playlist.name || 'playlist'}. ${result.error}`);
         setIsLoadingPlaylist(false);
         setChannels([]); // Clear channels to trigger empty state in Live TV
       }
       updatePlaylist(playlist.id, { 
         status: 'failed', 
         lastError: result.error 
       });
    }
  }

  async function loadPlaylistFromFile(file) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    console.log(`[Matrix_IPTV] Loading playlist from file: ${file.name}`);
    try {
      const text = await file.text();
      // Temporarily bypass playlistService and use the old m3uParser for local files
      const { processPlaylistText } = await import('./lib/m3u/m3uParser.js');
      const { channels, categories, epgUrl: parsedEpgUrl } = processPlaylistText(text);
      
      setEpgUrl(parsedEpgUrl);
      if (!parsedEpgUrl) {
        console.warn("[Matrix_IPTV] No EPG URL (x-tvg-url) found in playlist header.");
        setPlaylistMessage("No EPG URL found in playlist header.");
      }
      
      setChannels(channels);
      setCategories(categories);
      setActiveCategory(null);
      setSelectedChannel(null);
      setIsLoadingPlaylist(false);
      
      if (channels.length > 0) {
        setPlaylistMessage(`Loaded ${channels.length} channels from local file.`);
      } else {
        setPlaylistMessage('No channels found in the playlist.');
      }
    } catch (e) {
      console.error('[Matrix_IPTV] Failed to parse M3U file:', e);
      setPlaylistMessage('Failed to parse M3U file.');
      setIsLoadingPlaylist(false);
    }
  }

  return (
    <div className={`relative w-screen h-screen overflow-hidden font-sans ${darkMode ? "bg-[#0a1f22] text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      
      {/* LAYER 0: Background Player */}
      <div className={`absolute inset-0 bg-black ${currentView === 'player' ? 'z-50' : 'z-0'}`}>
        <PlayerPreview playerPreference={playerPreference} />
      </div>

      <div 
        className={`absolute inset-0 transition-opacity duration-300 ${
          currentView === 'player' ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-hidden={currentView === 'player'}
      >
        {/* Layer 1 (z-10): Active View Routing */}
        <div className="absolute inset-0 z-10 pointer-events-auto">
          <ViewRouter />
        </div>

        {/* Layer 2 (z-20): Navigation */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div className="pointer-events-auto">
            <Sidebar activeZone="sidebar" onSelect={(id) => {
              if (id === 'settings') setIsSettingsOpen(true);
              else setCurrentView(id);
            }} />
          </div>
          <div className="pointer-events-auto">
            <BottomNavigationBar currentView={currentView} onSelect={(id) => {
              if (id === 'settings') setIsSettingsOpen(true);
              else setCurrentView(id);
            }} />
          </div>
        </div>

        {/* Layer 2.5: Global Loader */}
        <GlobalLoader isLoading={isLoadingPlaylist || isLoadingEpg} />

        {/* Layer 3 (z-30): Overlays */}
        <div className="absolute inset-0 z-30 pointer-events-none">
          <div className="pointer-events-auto">
            <SettingsDrawer
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}