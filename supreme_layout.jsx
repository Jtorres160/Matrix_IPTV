import React, { useState, useEffect } from "react";
import ReactPlayer from "react-player";
import ProfileSwitcher from "./ProfileSwitcher.jsx";
import { useActiveSettings, useActiveProfile, useProfilesStore } from "./profileStore.js";

// ... (Sidebar, CategoryList, ChannelList components are unchanged) ...
const Sidebar = ({ onNavigate, onOpenSettings }) => (
  <div className="flex flex-col gap-4 p-4 bg-[#0e2a2d] h-full border-r border-gray-700 text-gray-200 text-sm">
    <nav className="flex flex-col gap-3">
      <button className="hover:text-white text-left" onClick={() => onNavigate("search")}>
        🔍 Search
      </button>
      <button className="hover:text-white text-left" onClick={() => onNavigate("tv")}>
        📺 TV
      </button>
      <button className="hover:text-white text-left" onClick={() => onNavigate("movies")}>
        🎬 Movies
      </button>
      <button className="hover:text-white text-left" onClick={() => onNavigate("shows")}>
        📑 Shows
      </button>
      <button className="hover:text-white text-left" onClick={() => onNavigate("recordings")}>
        🎥 Recordings
      </button>
      <button className="hover:text-white text-left" onClick={() => onNavigate("mylist")}>
        📂 My List
      </button>
      <button className="hover:text-white text-left" onClick={onOpenSettings}>
        ⚙️ Settings
      </button>
    </nav>
  </div>
);

const CategoryList = ({ categories = [], activeCategory, onSelectCategory }) => {
  if (!categories || categories.length === 0) {
    return (
      <div className="flex flex-col p-4 bg-[#0c3337] text-gray-100 border-r border-gray-700 overflow-y-auto">
        <div className="text-sm text-gray-400">No categories. Add an M3U playlist.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 bg-[#0c3337] text-gray-100 border-r border-gray-700 overflow-y-auto">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelectCategory(activeCategory === cat ? null : cat)}
          className={`text-left p-2 rounded cursor-pointer transition hover:bg-[#1b4c52] ${
            activeCategory === cat ? 'bg-[#1b4c52]' : ''
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
};

const ChannelList = ({ channels = [], onSelect }) => {
  return (
    <div className="flex flex-col p-4 text-gray-200 text-sm bg-[#0a1f22] flex-1 overflow-y-auto">
      {channels.length === 0 && (
        <div className="text-sm text-gray-400">
          No channels yet. Add an M3U playlist to start.
        </div>
      )}
      {channels.map((ch) => (
        <div
          key={ch.url || ch.id}
          onClick={() => onSelect(ch)}
          className="flex justify-between items-center border-b border-gray-700 py-2 cursor-pointer hover:bg-[#123234]"
        >
          <div>
            <span className="text-red-500 font-bold mr-2">LIVE</span>
            {ch.name}
          </div>
          <span className="text-gray-500">{ch.status}</span>
        </div>
      ))}
    </div>
  );
};


const PlayerPreview = ({ selectedChannel, playerPreference, darkMode }) => {
  // Open VLC only when selection or preference changes
  useEffect(() => {
    if (selectedChannel && playerPreference === "vlc") {
      window.open(`vlc://${selectedChannel.url}`);
    }
  }, [selectedChannel && selectedChannel.url, playerPreference]);

  if (!selectedChannel)
    return (
      <div
        className={`flex-1 flex items-center justify-center text-sm border-b border-gray-700 ${darkMode ? "bg-black text-gray-600" : "bg-gray-200 text-gray-800"
          }`}
      >
        No Preview Available
      </div>
    );

  return (
    <div className="flex-1 border-b border-gray-700">
      <ReactPlayer
        url={selectedChannel.url}
        playing
        controls
        width="100%"
        height="100%"
      />
    </div>
  );
};

// ... (EPGInfo, SettingsModal, PlaylistManager components are unchanged) ...
const EPGInfo = ({ epgData }) => (
  <div className="p-4 bg-[#0c3337] text-gray-400 text-sm h-[40%] overflow-y-auto">
    {epgData.length > 0 ? (
      epgData.map((prog, i) => (
        <div key={i} className="mb-3">
          <div className="text-white font-semibold">{prog.title}</div>
          <div>{prog.time}</div>
          <div className="text-xs text-gray-500">{prog.desc}</div>
        </div>
      ))
    ) : (
      <div>
        <div className="font-bold text-white mb-2">No information</div>
        <div>07:00 AM - 08:00 AM</div>
      </div>
    )}
  </div>
);

const SettingsModal = ({
  isOpen,
  onClose,
  darkMode,
  setDarkMode,
  playerPreference,
  setPlayerPreference,
  autoRefresh,
  setAutoRefresh,
  playlists,
  onAddPlaylist,
  onRemovePlaylist,
  onUploadFile,
  isLoading,
  statusMessage,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-[#0e2a2d] p-6 rounded-xl w-96 text-gray-200 shadow-xl border border-gray-700">
        <h2 className="text-lg font-bold mb-2">⚙️ Settings</h2>
        <div className="mb-4">
          <ProfileSwitcher />
        </div>

        <div className="mb-4">
          <label className="block mb-2">Theme</label>
          <select
            value={darkMode ? "dark" : "light"}
            onChange={(e) => setDarkMode(e.target.value === "dark")}
            className="w-full p-2 bg-[#0c3337] rounded border border-gray-600"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block mb-2">Player Preference</label>
          <select
            value={playerPreference}
            onChange={(e) => setPlayerPreference(e.target.value)}
            className="w-full p-2 bg-[#0c3337] rounded border border-gray-600"
          >
            <option value="internal">Internal Player</option>
            <option value="vlc">VLC (External App)</option>
            <option value="embeddedVLC" disabled={!(window.desktop && window.desktop.isElectron)}>VLC (Embedded)</option>
          </select>
          {playerPreference === 'embeddedVLC' && !(window.desktop && window.desktop.isElectron) && (
            <p className="mt-1 text-xs text-yellow-400">Embedded VLC is only available in the desktop app.</p>
          )}
        </div>

        <div className="mb-4">
          <label className="block mb-2">Auto Refresh</label>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="mr-2"
          />
          Enable auto refresh every 60s
        </div>

        <div className="mb-4">
          <label className="block mb-2">Playlists (per profile)</label>
          <PlaylistManager
            playlists={playlists}
            onAdd={onAddPlaylist}
            onRemove={onRemovePlaylist}
            onUploadFile={onUploadFile}
            isLoading={isLoading}
            statusMessage={statusMessage}
          />
        </div>

        <button
          onClick={onClose}
          className="mt-2 w-full bg-blue-500 hover:bg-blue-600 p-2 rounded"
        >
          Close
        </button>
      </div>
    </div>
  );
};

function PlaylistManager({ playlists = [], onAdd, onRemove, onUploadFile, isLoading, statusMessage }) {
  const [url, setUrl] = React.useState("");
  const [localMsg, setLocalMsg] = React.useState("");
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste M3U URL"
          className="w-full p-2 bg-[#0c3337] rounded border border-gray-600 text-sm"
        />
        <button
          onClick={async () => {
            if (!url) return;
            const ok = await onAdd(url);
            setLocalMsg(ok ? 'Playlist loaded.' : 'Failed to load playlist (check CORS or URL).');
            if (ok) setUrl("");
          }}
          disabled={!url || isLoading}
          className={`text-white px-3 py-2 rounded text-sm ${isLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-500'}`}
        >
          {isLoading ? 'Loading…' : 'Add'}
        </button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm">
          Upload M3U
          <input
            type="file"
            accept=".m3u,.m3u8,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (f) onUploadFile(f);
            }}
          />
        </label>
      </div>
      {(statusMessage || localMsg) && (
        <div className="text-xs text-gray-400 mb-2">{statusMessage || localMsg}</div>
      )}
      {playlists && playlists.length > 0 ? (
        <ul className="space-y-2 max-h-40 overflow-auto">
          {playlists.map((p, idx) => (
            <li key={`${p}-${idx}`} className="flex items-center justify-between gap-2">
              <span className="truncate text-xs" title={p}>{p}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const ok = await onAdd(p);
                    setLocalMsg(ok ? 'Playlist loaded.' : 'Failed to load playlist.');
                  }}
                  disabled={isLoading}
                  className={`text-xs rounded border border-gray-600 px-2 py-1 ${isLoading ? '' : 'hover:bg-[#123234]'}`}
                >
                  Load
                </button>
                <button
                  onClick={() => onRemove(p)}
                  className="text-xs text-red-400 rounded border border-gray-600 px-2 py-1 hover:bg-red-900/30"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-gray-400">No playlists saved yet.</div>
      )}
    </div>
  );
}


export default function App() {
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [epgData, setEpgData] = useState([]);
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [playlistMessage, setPlaylistMessage] = useState("");
  
  // State is now read from the store
  const activeSettings = useActiveSettings();
  const activeProfile = useActiveProfile();
  const updateSettings = useProfilesStore((s) => s.updateSettings);
  const addPlaylistToProfile = useProfilesStore((s) => s.addPlaylist);
  const removePlaylistFromProfile = useProfilesStore((s) => s.removePlaylist);

  // Get values directly from the store with fallbacks
  const darkMode = activeSettings?.theme === 'dark';
  const playerPreference = activeSettings?.playerPreference || 'internal';
  const autoRefresh = !!activeSettings?.autoRefresh;

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        console.log("Auto refresh triggered");
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // REMOVED the two useEffect hooks that synced local state

  // Auto-load first saved playlist when profile changes
  useEffect(() => {
    if (activeProfile && activeProfile.playlists && activeProfile.playlists[0]) {
      loadPlaylist(activeProfile.playlists[0]);
    }
  }, [activeProfile?.id]);

  useEffect(() => {
    async function fetchEPG() {
      try {
        const res = await fetch("https://iptv-org.github.io/epg/guides/us.xml");
        const xmlText = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const programs = Array.from(xmlDoc.getElementsByTagName("programme"))
          .slice(0, 5)
          .map((prog) => ({
            title: prog.getElementsByTagName("title")[0]?.textContent || "No title",
            time: `${prog.getAttribute("start")} - ${prog.getAttribute("stop")}`,
            desc: prog.getElementsByTagName("desc")[0]?.textContent || "No description",
          }));
        setEpgData(programs);
      } catch (err) {
        console.error("EPG fetch error:", err);
      }
    }

    fetchEPG();
  }, []);

  // Preferred labels we map to when a playlist uses a close variant
  const ALLOWED_CATEGORIES = [
    "LATINO CINEMA",
    "Univisión/Unimas/Telemundo",
    "SPAIN",
    "Dominican Republic",
    "ECUADOR",
    "PERU",
    "ARGENTINA",
    "BRAZIL",
    "AFRICA",
    "Caribbean",
    "COLOMBIA",
    "GERMANY",
    "ITALY",
    "INDIAN | PUNJABI",
  ];

  // Map common variants to the preferred labels, but if no match is found
  // we will fall back to using the original group title from the playlist.
  const CATEGORY_ALIASES = {
    "LATINO CINEMA": ["latino", "latin", "latam", "latino cinema", "cine latino"],
    "Univisión/Unimas/Telemundo": ["univision", "uni vision", "unimas", "uni mas", "telemundo"],
    "SPAIN": ["spain", "españa", "espana", "spanish spain"],
    "Dominican Republic": ["dominican", "dominicana", "rd", "republica dominicana"],
    "ECUADOR": ["ecuador", "ec"],
    "PERU": ["peru", "pe"],
    "ARGENTINA": ["argentina", "ar"],
    "BRAZIL": ["brazil", "brasil", "br"],
    "AFRICA": ["africa", "afr", "african"],
    "Caribbean": ["caribbean", "caribe"],
    "COLOMBIA": ["colombia", "co"],
    "GERMANY": ["germany", "deutsch", "de"],
    "ITALY": ["italy", "italia", "it"],
    "INDIAN | PUNJABI": ["india", "indian", "hindi", "punjabi", "in"],
  };

  function normalize(str) {
    return (str || "")
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function mapGroupToAllowed(group) {
    const g = normalize(group);
    for (const allowed of ALLOWED_CATEGORIES) {
      const aliases = CATEGORY_ALIASES[allowed] || [];
      if (aliases.some((a) => g.includes(a))) return allowed;
      // direct match to allowed label too
      if (normalize(allowed) === g) return allowed;
    }
    // Fallback: use the original group name from the playlist
    return (group && group.trim()) || 'Other';
  }

  function parseM3U(text) {
    const lines = text.split(/\r?\n/);
    const parsed = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXTINF')) {
        const meta = line;
        const url = (lines[i + 1] || '').trim();
        const nameMatch = meta.match(/,(.*)$/);
        const name = nameMatch ? nameMatch[1].trim() : 'Channel';
        const groupMatch = meta.match(/group-title="([^"]+)"/i);
        const group = groupMatch ? groupMatch[1].trim() : '';
        parsed.push({ name, url, group });
      }
    }
    return parsed;
  }

  async function loadPlaylist(url) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const items = parseM3U(text);
      const withGroups = items
        .map((it, idx) => {
          const group = mapGroupToAllowed(it.group);
          return { id: `${it.name}-${idx}`, name: it.name, status: 'LIVE', url: it.url, group };
        });
      setChannels(withGroups);
      const cats = Array.from(new Set(withGroups.map((c) => c.group))).filter(Boolean);
      setCategories(cats);
      setActiveCategory(null);
      setSelectedChannel(null);
      if (withGroups.length > 0) {
        setPlaylistMessage(`Loaded ${withGroups.length} channels across ${cats.length} categories.`);
        return true;
      } else {
        setPlaylistMessage('No channels found in the playlist.');
        return false;
      }
    } catch (e) {
      console.error('Failed to load M3U:', e);
      setPlaylistMessage('Failed to load M3U URL (CORS or network). Try local file upload.');
      return false;
    } finally {
      setIsLoadingPlaylist(false);
    }
  }

  async function loadPlaylistFromFile(file) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    try {
      const text = await file.text();
      const items = parseM3U(text);
      const withGroups = items
        .map((it, idx) => {
          const group = mapGroupToAllowed(it.group);
          return { id: `${it.name}-${idx}`, name: it.name, status: 'LIVE', url: it.url, group };
        });
      setChannels(withGroups);
      const cats = Array.from(new Set(withGroups.map((c) => c.group))).filter(Boolean);
      setCategories(cats);
      setActiveCategory(null);
      setSelectedChannel(null);
      if (withGroups.length > 0) {
        setPlaylistMessage(`Loaded ${withGroups.length} channels across ${cats.length} categories.`);
      } else {
        setPlaylistMessage('No channels found in the playlist.');
      }
    } catch (e) {
      console.error('Failed to parse M3U file:', e);
      setPlaylistMessage('Failed to parse M3U file.');
    } finally {
      setIsLoadingPlaylist(false);
    }
  }

  return (
    <div
      className={`flex h-screen font-sans ${darkMode ? "bg-[#0a1f22] text-gray-100" : "bg-gray-100 text-gray-900"
        }`}
    >
      <Sidebar onNavigate={() => {}} onOpenSettings={() => setIsSettingsOpen(true)} />
      <CategoryList categories={categories} activeCategory={activeCategory} onSelectCategory={setActiveCategory} />
      {/* Middle column: channels filtered by active category */}
      <div className="flex flex-col w-80 border-r border-gray-700">
        <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-800">Channels</div>
        <FilteredChannelList
          channels={channels}
          activeCategory={activeCategory}
          onSelect={setSelectedChannel}
        />
      </div>
      {/* Right content: player + EPG */}
      <div className="flex flex-col flex-1 relative">
        <div className="absolute top-2 right-2 flex items-center gap-3">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded"
          >
            ⚙️
          </button>
        </div>
        {playerPreference === 'embeddedVLC' && (window.desktop && window.desktop.isElectron) ? (
          <div className="flex-1 border-b border-gray-700 flex items-center justify-center text-sm text-gray-400">
            Embedded VLC coming next. Using internal player as fallback.
          </div>
        ) : (
          <PlayerPreview
            key={selectedChannel ? selectedChannel.url : 'no-channel'} /* <-- THIS IS THE FIX */
            selectedChannel={selectedChannel}
            playerPreference={playerPreference}
            darkMode={darkMode}
          />
        )}
        {playlistMessage && (
          <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-800">
            {playlistMessage}
          </div>
        )}
        <EPGInfo epgData={epgData} />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          
          // UPDATED PROPS
          darkMode={darkMode}
          setDarkMode={(isDark) => updateSettings({ theme: isDark ? 'dark' : 'light' })}
          playerPreference={playerPreference}
          setPlayerPreference={(pref) => updateSettings({ playerPreference: pref })}
          autoRefresh={autoRefresh}
          setAutoRefresh={(enabled) => updateSettings({ autoRefresh: enabled })}
          
          playlists={activeProfile ? activeProfile.playlists : []}
          onAddPlaylist={async (url) => {
            const ok = await loadPlaylist(url);
            if (ok) addPlaylistToProfile(url); // This will now work
            return ok;
          }}
          onRemovePlaylist={(url) => removePlaylistFromProfile(url)} // This will now work
          onUploadFile={(file) => loadPlaylistFromFile(file)}
          isLoading={isLoadingPlaylist}
          statusMessage={playlistMessage}
        />
      </div>
    </div>
  );
}

function FilteredChannelList({ channels, activeCategory, onSelect }) {
  const filtered = React.useMemo(() => {
    return channels.filter((c) => (activeCategory ? c.group === activeCategory : true));
  }, [channels, activeCategory]);
  return <ChannelList channels={filtered} onSelect={onSelect} />;
}