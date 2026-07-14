import React, { useState, useEffect } from "react";
import ReactPlayer from "react-player";
import ProfileSwitcher from "./ProfileSwitcher.jsx";
import { useActiveSettings, useActiveProfile, useProfilesStore } from "./profileStore.js";

// --- Sidebar, CategoryList, ChannelList are unchanged ---
const Sidebar = ({ onNavigate, onOpenSettings }) => (
  <div className="flex flex-col gap-4 p-4 bg-[#0e2a2d] h-full border-r border-gray-700 text-gray-200 text-sm">
  <nav className="flex flex-col gap-3">
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

const ChannelList = ({ channels = [], onSelect, selectedChannelId }) => {
  return (
    <div className="flex flex-col p-4 text-gray-200 text-sm bg-[#0a1f22] flex-1 overflow-y-auto">
    {channels.length === 0 && (
      <div className="text-sm text-gray-400">
      No channels found.
      </div>
    )}
    {channels.map((ch) => (
      <div
      key={ch.url || ch.id}
      onClick={() => onSelect(ch)}
      className={`flex justify-between items-center border-b border-gray-700 py-2 cursor-pointer hover:bg-[#123234] ${
        selectedChannelId === ch.id ? 'bg-[#123234]' : ''
      }`}
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
  const [playerError, setPlayerError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [vlcAvailable, setVlcAvailable] = useState(false);
  const vlcCheckDone = React.useRef(false);

  useEffect(() => {
    if (!vlcCheckDone.current && window.electronVLC) {
      window.electronVLC.check().then(result => {
        setVlcAvailable(result.available);
        if (!result.available) {
          console.warn('[Matrix_IPTV] VLC not found. Install VLC Media Player for external playback.');
        }
      }).catch(err => {
        console.error('[Matrix_IPTV] VLC check failed:', err);
      });
      vlcCheckDone.current = true;
    }
  }, []);

  useEffect(() => {
    setPlayerError(false);
    setIsReady(false);
  }, [selectedChannel?.url]);

  useEffect(() => {
    if (selectedChannel && playerPreference === "vlc" && window.electronVLC) {
      window.electronVLC.load({
        url: selectedChannel.url,
        title: `LIVE: ${selectedChannel.name}`,
        options: [
          '--network-caching=1000',
          '--file-caching=1000',
          '--live-caching=1000',
        ]
      }).catch(err => {
        console.error('[Matrix_IPTV] Failed to open VLC:', err);
        setPlayerError(true);
      });
    }
    return () => {
      if (window.electronVLC && playerPreference === "vlc") {
        window.electronVLC.stop().catch(err => console.error('[Matrix_IPTV] VLC stop error:', err));
      }
    };
  }, [selectedChannel?.url, playerPreference]);

  if (!selectedChannel) {
    return (
      <div className={`flex-1 flex items-center justify-center text-sm border-b border-gray-700 ${
        darkMode ? "bg-black text-gray-600" : "bg-gray-200 text-gray-800"
      }`}>
      No Preview Available
      </div>
    );
  }

  if (playerPreference === "vlc") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border-b border-gray-700 bg-black text-gray-400">
      <div className="text-lg mb-2">📺 Playing in VLC</div>
      <div className="text-sm mb-2">{selectedChannel.name}</div>
      {!vlcAvailable && (
        <div className="text-yellow-500 mt-4 text-xs">
        VLC not detected. Install VLC Media Player if it doesn't open.
        </div>
      )}
      {playerError && (
        <div className="text-red-500 mt-4 text-xs">
        Failed to open VLC. Make sure VLC is installed.
        </div>
      )}
      </div>
    );
  }

  if (playerPreference === "embeddedVLC") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border-b border-gray-700 bg-black text-gray-400">
      <div className="text-yellow-500 mb-2">⚠️ Embedded VLC Coming Soon</div>
      <div className="text-sm mb-2">Using ReactPlayer as fallback</div>
      <div className="text-xs text-gray-500">Switch to "VLC (External App)" for VLC playback</div>
      </div>
    );
  }

  // Internal ReactPlayer (default)
  return (
    <div className="flex-1 border-b border-gray-700 bg-black relative">
    {!isReady && (
      <div className="absolute inset-0 flex items-center justify-center text-white z-10">
      <div className="text-sm">Loading {selectedChannel.name}...</div>
      </div>
    )}
    <ReactPlayer
    key={selectedChannel.url}
    url={selectedChannel.url}
    playing
    controls
    width="100%"
    height="100%"
    onReady={() => setIsReady(true)}
    onError={(e) => {
      // --- *** ADDED CONSOLE LOG *** ---
      console.error('[Matrix_IPTV] ReactPlayer Error:', e, 'for URL:', selectedChannel.url);
      // --- *** END OF CHANGE *** ---
      setPlayerError(true);
    }}
    />
    {playerError && (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white z-20">
      <div className="text-red-500 mb-2">⚠️ Playback Error</div>
      <div className="text-sm mb-4">{selectedChannel.name}</div>
      <button
      onClick={() => {
        setPlayerError(false);
        setIsReady(false);
      }}
      className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded"
      >
      Retry
      </button>
      </div>
    )}
    </div>
  );
};

const EPGInfo = ({ epgData }) => (
  <div className="p-4 bg-[#0c3337] text-gray-400 text-sm h-[40%] overflow-y-auto">
  {epgData && epgData.length > 0 ? (
    epgData.map((prog, i) => (
      <div key={i} className="mb-3">
      <div className="text-white font-semibold">{prog.title}</div>
      <div>{prog.time}</div>
      <div className="text-xs text-gray-500">{prog.desc}</div>
      </div>
    ))
  ) : (
    <div>
    <div className="font-bold text-white mb-2">No EPG data for this channel.</div>
    <div>Check if the M3U playlist has a `tvg-id` for this channel.</div>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
    <option value="internal">Internal Player (ReactPlayer)</option>
    <option value="vlc">VLC (External App)</option>
    <option value="embeddedVLC">VLC (Embedded - Coming Soon)</option>
    </select>
    {playerPreference === 'vlc' && (
      <p className="mt-1 text-xs text-gray-400">Opens streams in VLC Media Player</p>
    )}
    {playerPreference === 'embeddedVLC' && (
      <p className="mt-1 text-xs text-yellow-400">Embedded VLC is under development</p>
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

function parseM3UHeader(text) {
  const lines = text.split(/\r?\n/);
  const header = lines[0];
  if (!header || !header.startsWith('#EXTM3U')) return null;

  const urlMatch = header.match(/x-tvg-url="([^"]+)"/i);
  return urlMatch ? urlMatch[1].trim() : null;
}

function parseM3UChannels(text) {
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

      const tvgIdMatch = meta.match(/tvg-id="([^"]+)"/i);
      const tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : null;
      
      parsed.push({ name, url, group, tvgId });
    }
  }
  return parsed;
}

export default function App() {
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [playlistMessage, setPlaylistMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [epgUrl, setEpgUrl] = useState(null);
  const [epgData, setEpgData] = useState(new Map());
  const [isLoadingEpg, setIsLoadingEpg] = useState(false);

  const activeSettings = useActiveSettings();
  const activeProfile = useActiveProfile();
  const updateSettings = useProfilesStore((s) => s.updateSettings);
  const addPlaylistToProfile = useProfilesStore((s) => s.addPlaylist);
  const removePlaylistFromProfile = useProfilesStore((s) => s.removePlaylist);

  const darkMode = activeSettings?.theme === 'dark';
  const playerPreference = activeSettings?.playerPreference || 'internal';
  const autoRefresh = !!activeSettings?.autoRefresh;

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        console.log("[Matrix_IPTV] Auto-refresh triggered.");
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  useEffect(() => {
    setChannels([]);
    setCategories([]);
    setSelectedChannel(null);
    setEpgUrl(null);
    setEpgData(new Map());
    setSearchTerm("");

    if (activeProfile && activeProfile.playlists && activeProfile.playlists[0]) {
      loadPlaylist(activeProfile.playlists[0]);
    }
  }, [activeProfile?.id]);

  useEffect(() => {
    async function fetchEPG(url) {
      if (!url) {
        setEpgData(new Map());
        return;
      }
      setIsLoadingEpg(true);
      setPlaylistMessage(prev => prev + ' Loading EPG...');
      console.log(`[Matrix_IPTV] Fetching EPG from: ${url}`);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xmlText = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        const programsByChannel = new Map();
        const allPrograms = xmlDoc.getElementsByTagName("programme");

        for (const prog of allPrograms) {
          const channelId = prog.getAttribute("channel");
          if (!channelId) continue;

          const progData = {
            title: prog.getElementsByTagName("title")[0]?.textContent || "No title",
            time: `${prog.getAttribute("start")} - ${prog.getAttribute("stop")}`,
            desc: prog.getElementsByTagName("desc")[0]?.textContent || "No description",
          };

          if (!programsByChannel.has(channelId)) {
            programsByChannel.set(channelId, []);
          }
          programsByChannel.get(channelId).push(progData);
        }
        
        setEpgData(programsByChannel);
        setPlaylistMessage(prev => prev.replace('Loading EPG...', `Loaded EPG for ${programsByChannel.size} channels.`));
        console.log(`[Matrix_IPTV] EPG loaded with data for ${programsByChannel.size} channels.`);
      } catch (err) {
        console.error("[Matrix_IPTV] EPG fetch error:", err);
        setPlaylistMessage(prev => prev.replace('Loading EPG...', 'Failed to load EPG.'));
      } finally {
        setIsLoadingEpg(false);
      }
    }

    fetchEPG(epgUrl);
  }, [epgUrl]);


  const ALLOWED_CATEGORIES = [
    "LATINO CINEMA", "Univisión/Unimas/Telemundo", "SPAIN", "Dominican Republic",
    "ECUADOR", "PERU", "ARGENTINA", "BRAZIL", "AFRICA", "Caribbean", "COLOMBIA",
    "GERMANY", "ITALY", "INDIAN | PUNJABI",
  ];

  const CATEGORY_ALIASES = {
    "LATINO CINEMA": ["latino", "latin", "latam", "latino cinema", "cine latino"],
    "Univisión/Unimas/Telemundo": ["univision", "uni vision", "unimas", "uni mas", "telemundo"],
    "SPAIN": ["spain", "españa", "espana", "spanish spain"],
    "Dominican Republic": ["dominican", "dominicana", "rd", "republica dominicana"],
    "ECUADOR": ["ecuador", "ec"], "PERU": ["peru", "pe"], "ARGENTINA": ["argentina", "ar"],
    "BRAZIL": ["brazil", "brasil", "br"], "AFRICA": ["africa", "afr", "african"],
    "Caribbean": ["caribbean", "caribe"], "COLOMBIA": ["colombia", "co"],
    "GERMANY": ["germany", "deutsch", "de"], "ITALY": ["italy", "italia", "it"],
    "INDIAN | PUNJABI": ["india", "indian", "hindi", "punjabi", "in"],
  };

  function normalize(str) {
    return (str || "").toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function mapGroupToAllowed(groupString) {
    if (!groupString || !groupString.trim()) {
      return ['Other'];
    }
    const individualGroups = groupString.split(';');
    const mappedGroups = new Set();
    for (const group of individualGroups) {
      const g = normalize(group);
      if (!g) continue;
      let found = false;
      for (const allowed of ALLOWED_CATEGORIES) {
        const aliases = CATEGORY_ALIASES[allowed] || [];
        if (aliases.some((a) => g.includes(a))) {
          mappedGroups.add(allowed);
          found = true;
          break;
        }
        if (normalize(allowed) === g) {
          mappedGroups.add(allowed);
          found = true;
          break;
        }
      }
      if (!found) {
        const cleanGroup = group.trim();
        if (cleanGroup) {
          mappedGroups.add(cleanGroup);
        }
      }
    }
    const finalGroups = Array.from(mappedGroups);
    return finalGroups.length > 0 ? finalGroups : ['Other'];
  }

  async function processPlaylistText(text) {
    const parsedEpgUrl = parseM3UHeader(text);
    setEpgUrl(parsedEpgUrl);
    if (!parsedEpgUrl) {
      console.warn("[Matrix_IPTV] No EPG URL (x-tvg-url) found in playlist header.");
      setPlaylistMessage("No EPG URL found in playlist header.");
    }
    const items = parseM3UChannels(text);
    const withGroups = items.map((it, idx) => {
      const groups = mapGroupToAllowed(it.group);
      return { 
        id: `${it.name}-${idx}`, 
        name: it.name, 
        status: 'LIVE', 
        url: it.url, 
        groups: groups,
        tvgId: it.tvgId
      };
    });
    setChannels(withGroups);
    const allGroups = withGroups.flatMap(c => c.groups);
    const cats = Array.from(new Set(allGroups)).filter(Boolean).sort();
    setCategories(cats);
    setActiveCategory(null);
    setSelectedChannel(null);
    if (withGroups.length > 0) {
      console.log(`[Matrix_IPTV] Playlist processed: ${withGroups.length} channels, ${cats.length} categories.`);
      setPlaylistMessage(prev => `Loaded ${withGroups.length} channels. ` + prev);
      return true;
    } else {
      console.warn("[Matrix_IPTV] No channels found in the playlist.");
      setPlaylistMessage('No channels found in the playlist.');
      return false;
    }
  }

  async function loadPlaylist(url) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    console.log(`[Matrix_IPTV] Loading playlist from URL: ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return await processPlaylistText(text);
    } catch (e) {
      console.error('[Matrix_IPTV] Failed to load M3U URL:', e);
      setPlaylistMessage('Failed to load M3U URL (CORS or network). Try local file upload.');
      return false;
    } finally {
      setIsLoadingPlaylist(false);
    }
  }

  async function loadPlaylistFromFile(file) {
    setPlaylistMessage("");
    setIsLoadingPlaylist(true);
    console.log(`[Matrix_IPTV] Loading playlist from file: ${file.name}`);
    try {
      const text = await file.text();
      await processPlaylistText(text);
    } catch (e) {
      console.error('[Matrix_IPTV] Failed to parse M3U file:', e);
      setPlaylistMessage('Failed to parse M3U file.');
    } finally {
      setIsLoadingPlaylist(false);
    }
  }

  const selectedChannelEpg = selectedChannel
    ? (epgData.get(selectedChannel.tvgId) || [])
    : [];

  const handleCategorySelect = (category) => {
    console.log(`[Matrix_IPTV] Category selected: ${category}`);
    setSelectedChannel(null);
    setSearchTerm("");
    setTimeout(() => {
      setActiveCategory(category);
    }, 0);
  };

  const handleChannelSelect = (channel) => {
    console.log(`[Matrix_IPTV] Channel selected: ${channel.name}`, channel);
    setSelectedChannel(null);
    setTimeout(() => {
      setSelectedChannel(channel);
    }, 0);
  };

  return (
    <div
      className={`flex h-screen font-sans ${darkMode ? "bg-[#0a1f22] text-gray-100" : "bg-gray-100 text-gray-900"
        }`}
    >
      <Sidebar onNavigate={() => {}} onOpenSettings={() => setIsSettingsOpen(true)} />
      <CategoryList 
        categories={categories} 
        activeCategory={activeCategory} 
        onSelectCategory={handleCategorySelect} 
      />
      
      <div className="flex flex-col w-80 border-r border-gray-700">
        <div className="p-2 border-b border-gray-800">
          <input
            type="text"
            placeholder="🔍 Search channels..."
            className="w-full p-1 bg-[#0c3337] text-gray-200 rounded border border-gray-600 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <FilteredChannelList
          channels={channels}
          activeCategory={activeCategory}
          searchTerm={searchTerm} 
          onSelect={handleChannelSelect}
          selectedChannelId={selectedChannel?.id}
        />
      </div>
      
      <div className="flex flex-col flex-1 relative">
        <div className="absolute top-2 right-2 flex items-center gap-3 z-10">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded"
          >
            ⚙️
          </button>
        </div>
        
        <PlayerPreview
          key={selectedChannel ? selectedChannel.url : 'no-channel'}
          selectedChannel={selectedChannel}
          playerPreference={playerPreference}
          darkMode={darkMode}
        />

        {(playlistMessage && !isLoadingEpg) && (
          <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-800">
            {playlistMessage}
          </div>
        )}
        <EPGInfo epgData={selectedChannelEpg} />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          darkMode={darkMode}
          setDarkMode={(isDark) => {
            console.log('[Matrix_IPTV] Setting theme:', isDark ? 'dark' : 'light');
            updateSettings({ theme: isDark ? 'dark' : 'light' });
          }}
          playerPreference={playerPreference}
          setPlayerPreference={(pref) => {
            console.log('[Matrix_IPTV] Setting player preference:', pref);
            updateSettings({ playerPreference: pref });
          }}
          autoRefresh={autoRefresh}
          setAutoRefresh={(enabled) => {
            console.log('[Matrix_IPTV] Setting auto-refresh:', enabled);
            updateSettings({ autoRefresh: enabled });
          }}
          playlists={activeProfile ? activeProfile.playlists : []}
          onAddPlaylist={async (url) => {
            const ok = await loadPlaylist(url);
            if (ok) addPlaylistToProfile(url);
            return ok;
          }}
          onRemovePlaylist={(url) => removePlaylistFromProfile(url)}
          onUploadFile={(file) => loadPlaylistFromFile(file)}
          isLoading={isLoadingPlaylist || isLoadingEpg}
          statusMessage={playlistMessage}
        />
      </div>
    </div>
  );
}

function FilteredChannelList({ channels, activeCategory, searchTerm, onSelect, selectedChannelId }) {
  const filtered = React.useMemo(() => {
    const categoryFiltered = channels.filter((c) => (activeCategory ? c.groups.includes(activeCategory) : true));
    
    if (!searchTerm) return categoryFiltered;
    
    const lowerSearch = searchTerm.toLowerCase();
    return categoryFiltered.filter((c) => 
      c.name.toLowerCase().includes(lowerSearch)
    );
  }, [channels, activeCategory, searchTerm]);
  
  return <ChannelList channels={filtered} onSelect={onSelect} selectedChannelId={selectedChannelId} />;
}