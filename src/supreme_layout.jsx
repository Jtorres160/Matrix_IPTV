import React, { useState, useEffect } from "react";
import { useActiveSettings, useActiveProfile, useProfilesStore } from "./profileStore.js";
import { useAppStore } from "./store/appStore.js";
import { processPlaylistText } from "./services/m3uParser.js";
import { fetchAndParseEPG } from "./services/epgParser.js";

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

  const darkMode = activeSettings?.theme === 'dark';
  const playerPreference = activeSettings?.playerPreference || 'internal';
  const autoRefresh = !!activeSettings?.autoRefresh;

  // Modals and UI overlays
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [epgUrl, setEpgUrl] = useState(null);

  // App Store bindings
  const {
    currentView,
    setCurrentView,
    setChannels,
    setCategories,
    setActiveCategory,
    setSelectedChannel,
    setEpgData,
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
  }, [currentView]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        console.log("[Matrix_IPTV] Auto-refresh triggered.");
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Handle Profile Switch
  useEffect(() => {
    resetVolatileState();
    setEpgUrl(null);

    if (activeProfile && activeProfile.playlists && activeProfile.playlists[0]) {
      loadPlaylist(activeProfile.playlists[0]);
    }
  }, [activeProfile?.id]);

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
  async function loadPlaylist(url) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    console.log(`[Matrix_IPTV] Loading playlist from URL: ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return processPlaylist(text);
    } catch (e) {
      console.error('[Matrix_IPTV] Failed to load M3U URL:', e);
      setPlaylistMessage('Failed to load M3U URL (CORS or network). Try local file upload.');
      setIsLoadingPlaylist(false);
      return false;
    }
  }

  async function loadPlaylistFromFile(file) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    console.log(`[Matrix_IPTV] Loading playlist from file: ${file.name}`);
    try {
      const text = await file.text();
      processPlaylist(text);
    } catch (e) {
      console.error('[Matrix_IPTV] Failed to parse M3U file:', e);
      setPlaylistMessage('Failed to parse M3U file.');
      setIsLoadingPlaylist(false);
    }
  }

  function processPlaylist(text) {
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
      setPlaylistMessage(prev => `Loaded ${channels.length} channels. ` + prev);
      return true;
    } else {
      setPlaylistMessage('No channels found in the playlist.');
      return false;
    }
  }

  return (
    <div className={`relative w-screen h-screen overflow-hidden font-sans ${darkMode ? "bg-[#0a1f22] text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      
      {/* LAYER 0: Background Player */}
      <div className="absolute inset-0 z-0 bg-black">
        <PlayerPreview playerPreference={playerPreference} />
      </div>

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
  );
}