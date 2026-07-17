import React, { useState, useEffect } from "react";
import { useActiveSettings, useActiveProfile, useProfilesStore } from "./store/profileStore";
import { useAppStore } from "./store/appStore.js";
import { fetchAndParseEPG } from "./services/epgParser.js";
import { loadPlaylist as fetchPlaylist } from "./lib/m3u/playlistService.js";
import { getPlaylistFromCache, savePlaylistToCache } from "./lib/m3u/playlistCache.js";
import { runChannelParityCheck, loadDbChannels } from "./lib/tv/dbChannelAdapter.js";
import { runIdentityBridgeDiagnostics } from "./lib/tv/identityBridge.js";
import { DB_CHANNEL_PARITY, USE_DB_CHANNELS } from "./config/featureFlags.js";
import { toMediaItem } from "./lib/media/mediaAdapter.js";

import { usePlayerStore } from "./player/playerStore.js";
import BottomNavigationBar from "./components/BottomNavigationBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import useMediaKeys from "./hooks/useMediaKeys.js";
import GlobalLoader from "./components/GlobalLoader.jsx";
import ViewRouter from "./components/ViewRouter.jsx";
import PlayerPreview from "./components/PlayerPreview.jsx";
import SettingsDrawer from "./components/SettingsDrawer.jsx";
import AutoplayResume from "./components/AutoplayResume.jsx";
import CommandPalette from "./components/CommandPalette.jsx";

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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  // Global search: Ctrl/Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // App Store bindings — individual selectors so App only re-renders when the
  // values it actually uses change (a whole-store subscription re-rendered the
  // entire tree on every store write, e.g. each EPG/message update).
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setMediaState = useAppStore((s) => s.setMediaState);
  const setCategories = useAppStore((s) => s.setCategories);
  const setActiveCategory = useAppStore((s) => s.setActiveCategory);
  const setSelectedChannel = useAppStore((s) => s.setSelectedChannel);
  const setEpgData = useAppStore((s) => s.setEpgData);
  const setEpgUrl = useAppStore((s) => s.setEpgUrl);
  const epgUrl = useAppStore((s) => s.epgUrl);
  const setIsLoadingPlaylist = useAppStore((s) => s.setIsLoadingPlaylist);
  const setPlaylistMessage = useAppStore((s) => s.setPlaylistMessage);
  const setIsLoadingEpg = useAppStore((s) => s.setIsLoadingEpg);
  const isLoadingPlaylist = useAppStore((s) => s.isLoadingPlaylist);
  const isLoadingEpg = useAppStore((s) => s.isLoadingEpg);
  const resetVolatileState = useAppStore((s) => s.resetVolatileState);
  const isImmersivePlayer = useAppStore((s) => s.isImmersivePlayer);
  const setIsImmersivePlayer = useAppStore((s) => s.setIsImmersivePlayer);
  const playerDock = useAppStore((s) => s.playerDock);
  const hasActiveChannel = usePlayerStore((s) => !!s.activeChannel);

  useEffect(() => {
    const lastView = localStorage.getItem('matrix_last_view');
    if (lastView) {
      setCurrentView(lastView);
    }
  }, []);

  // Global Keyboard Navigation (Back/Escape).
  // Single owner of "exit the player" — reads fresh store state instead of
  // closures. Multiple stale-closure handlers previously each cleared only
  // part of the player state, so exiting took two Escape presses.
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (key !== 'escape' && key !== 'backspace') return;

      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

      // Native fullscreen: let the browser exit it; don't also leave the player.
      if (document.fullscreenElement) return;

      const state = useAppStore.getState();
      if (state.isImmersivePlayer || state.currentView === 'player') {
        state.setIsImmersivePlayer(false);
        if (state.currentView === 'player') state.setCurrentView('live-tv');
      } else if (state.currentView !== 'live-tv') {
        state.setCurrentView('live-tv');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  // Apply custom User-Agent (Settings > Advanced) to all provider requests
  const customUserAgent = activeSettings?.customUserAgent || '';
  useEffect(() => {
    if (window.electronSession) {
      window.electronSession.setUserAgent(customUserAgent).catch(() => {});
    }
  }, [customUserAgent]);

  // The playlist marked active wins; fall back to the first one (legacy)
  const activePlaylist = activeProfile?.playlists?.find((p) => p.active) || activeProfile?.playlists?.[0];
  const activePlaylistUrl = activePlaylist?.url;

  // Handle Profile Switch or Main Playlist Change
  useEffect(() => {
    resetVolatileState();

    if (activePlaylist && activePlaylist.type === 'm3u') {
      loadM3UPlaylist(activePlaylist);
    }
  }, [activeProfile?.id, activePlaylistUrl]);

  // Handle EPG Fetching. A custom XMLTV URL (Settings > Guide & Data)
  // overrides the playlist's x-tvg-url header.
  const epgUrlOverride = (activeSettings?.epgUrlOverride || '').trim();
  const effectiveEpgUrl = epgUrlOverride || epgUrl;
  useEffect(() => {
    async function loadEPG() {
      if (!effectiveEpgUrl) {
        setEpgData(new Map());
        return;
      }
      setIsLoadingEpg(true);
      setPlaylistMessage(prev => prev + ' Loading EPG...');
      console.log(`[Matrix_IPTV] Fetching EPG from: ${effectiveEpgUrl}`);
      try {
        const epg = await fetchAndParseEPG(effectiveEpgUrl);
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
  }, [effectiveEpgUrl]);

  const updateMediaState = (rawChannels, playlistId) => {
    if (!rawChannels || rawChannels.length === 0) {
      setMediaState([]);
      return;
    }
    const mediaItems = rawChannels.map(c => toMediaItem(c, playlistId));
    setMediaState(mediaItems);
  };

  // M3U Loading Logic
  async function loadM3UPlaylist(playlist) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    
    // Check Cache
    const cached = await getPlaylistFromCache(playlist.url);
    if (cached) {
      // Playlist-level EPG (e.g. Xtream xmltv.php) beats the M3U header URL
      setEpgUrl(playlist.epgUrl || cached.epgUrl);
      updateMediaState(cached.channels, playlist.id);
      setCategories(cached.categories);
      setActiveCategory(null);
      setSelectedChannel(null);
      setIsLoadingPlaylist(false);
      setPlaylistMessage(`Loaded ${cached.channelCount} channels from cache.`);

      // Silently refresh in background when auto-refresh is enabled
      // (Settings > Advanced). Manual refresh stays available in Sources.
      if (autoRefresh) {
        refreshPlaylist(playlist, true);
      }
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
       setEpgUrl(playlist.epgUrl || result.epgUrl);
       updateMediaState(result.channels, playlist.id);
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
           .then(async () => {
             // Channels currently in the store are the renderer-parsed set
             // (set above). Track what the view is actually showing so the
             // Phase 2.3 identity bridge reports against the live data.
             let activeChannels = result.channels;

             // ── Phase 2.2: optional DB-backed Live TV source ─────────────
             // Flag OFF (default): no change — renderer channels stay the
             // source of truth. Flag ON: swap appStore channels for the
             // SQLite adapter output. The old path still ran (cache +
             // playlist status), it is not disabled. On any DB load failure
             // we keep the renderer channels — safe fallback.
             if (USE_DB_CHANNELS) {
               const dbLoad = await loadDbChannels(playlist.id);
               if (dbLoad.success && dbLoad.channels.length > 0) {
                 activeChannels = dbLoad.channels;
                 updateMediaState(dbLoad.channels, playlist.id);
                 setCategories(dbLoad.categories);
                 console.info(`[Matrix_IPTV] Live TV hydrated from SQLite: ${dbLoad.channels.length} channels (USE_DB_CHANNELS=true).`);
               } else {
                 console.warn(`[Matrix_IPTV] USE_DB_CHANNELS=true but DB load unavailable (${dbLoad.reason || 'empty'}); keeping renderer channels.`);
               }
             }

             // ── Phase 2.1: read-only parity diagnostics (observational) ──
             if (DB_CHANNEL_PARITY) {
               runChannelParityCheck({
                 rendererChannels: result.channels,
                 playlistId: playlist.id,
               }).catch(() => {});
             }

             // ── Phase 2.3: identity bridge diagnostics (observational) ───
             // Reports how many stored favorites / watchHistory entries
             // resolve against the live channel set. Read-only; never
             // migrates storage, never throws.
             try {
               const profileNow = useProfilesStore.getState().getActiveProfile();
               runIdentityBridgeDiagnostics({
                 channels: activeChannels,
                 favorites: profileNow?.favorites || [],
                 watchHistory: profileNow?.watchHistory || [],
                 mode: USE_DB_CHANNELS ? 'db' : 'renderer',
               });
             } catch (bridgeErr) {
               console.error('[Matrix_IPTV] Identity bridge diagnostics failed (non-fatal):', bridgeErr);
             }
           })
           .catch((dbErr) => console.error('[Matrix_IPTV] Background SQLite resync failed (non-fatal):', dbErr));
       }
    } else {
       if (!silent) {
         setPlaylistMessage(`Failed to load ${playlist.name || 'playlist'}. ${result.error}`);
         setIsLoadingPlaylist(false);
         setMediaState([]); // Clear channels to trigger empty state in Live TV
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
      
      updateMediaState(channels, 'local-file');
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
      
      <AutoplayResume enabled={!!activeSettings?.autoplayLastChannel} />

      {/* LAYER 0: Player. Three placements:
          - immersive/player view: full screen on top (z-50)
          - Channels browser with a channel selected: docked preview box that
            floats exactly over the browser's placeholder rect (z-40)
          - otherwise: full-screen background layer (z-0) */}
      <div
        className={
          isImmersivePlayer || currentView === 'player'
            ? 'absolute inset-0 bg-black z-50'
            : playerDock === 'preview' && currentView === 'channels' && hasActiveChannel
              ? 'absolute top-4 right-4 w-96 h-[216px] bg-black z-40 rounded-xl overflow-hidden border border-white/10 shadow-2xl'
              : 'absolute inset-0 bg-black z-0'
        }
      >
        <PlayerPreview playerPreference={playerPreference} />
      </div>

      <div 
        className={`absolute inset-0 transition-opacity duration-300 ${
          isImmersivePlayer || currentView === 'player' ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-hidden={isImmersivePlayer || currentView === 'player'}
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

      {/* Global search palette (works even while the player is up) */}
      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
    </div>
  );
}