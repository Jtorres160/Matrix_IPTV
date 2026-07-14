import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore.js';
import { useActiveProfile, useProfilesStore } from '../profileStore.js';
import { LucideSearch, LucideHeart, LucidePlayCircle, LucideTv, LucideCalendarDays, LucideImageOff } from 'lucide-react';
import { usePlayerStore } from '../player/playerStore.js';

export default function LiveTVView() {
  const channels = useAppStore((s) => s.channels);
  const categories = useAppStore((s) => s.categories);
  const epgData = useAppStore((s) => s.epgData);
  const isLoadingPlaylist = useAppStore((s) => s.isLoadingPlaylist);
  const activeCategory = useAppStore((s) => s.activeCategory);
  const setActiveCategory = useAppStore((s) => s.setActiveCategory);
  const selectedChannel = useAppStore((s) => s.selectedChannel);
  const setSelectedChannel = useAppStore((s) => s.setSelectedChannel);
  
  const [searchQuery, setSearchQuery] = useState("");
  
  const activeProfile = useActiveProfile();
  const toggleFavorite = useProfilesStore((s) => s.toggleFavorite);
  const addRecentlyWatched = useProfilesStore((s) => s.addRecentlyWatched);
  
  const favorites = activeProfile?.favorites || [];
  const recentlyWatched = activeProfile?.recentlyWatched || [];
  
  const { activeUrl, setChannel, setPlaylist, playlist } = usePlayerStore();

  // Sync playlist to playerStore for navigation
  useEffect(() => {
    // Only update if array references change substantially or length changes
    if (playlist.length !== channels.length) {
      setPlaylist(channels);
    }
  }, [channels, playlist.length, setPlaylist]);

  // 1. FILTERING
  const filteredChannels = useMemo(() => {
    let result = channels;
    
    // Filter by category
    if (activeCategory) {
      if (activeCategory === "Favorites") {
        result = result.filter(c => favorites.includes(c.id));
      } else if (activeCategory === "Recently Watched") {
        // Sort by recency
        result = result.filter(c => recentlyWatched.includes(c.id))
                       .sort((a, b) => recentlyWatched.indexOf(a.id) - recentlyWatched.indexOf(b.id));
      } else {
        result = result.filter(c => c.groups.includes(activeCategory));
      }
    }
    
    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(q) || 
        c.groups.some(g => g.toLowerCase().includes(q))
      );
    }
    
    return result;
  }, [channels, activeCategory, searchQuery, favorites, recentlyWatched]);

  // EPG Helper
  const getEpgForChannel = (tvgId) => {
    return epgData.get(tvgId) || [];
  };

  const currentEpg = selectedChannel ? getEpgForChannel(selectedChannel.tvgId) : [];

  // Handlers
  const handleSelectChannel = (channel) => {
    setSelectedChannel(channel);
  };

  const handlePlayChannel = (channel) => {
    setSelectedChannel(channel);
    addRecentlyWatched(channel.id);
    setChannel(channel);
  };

  // EMPTY STATES
  if (isLoadingPlaylist) {
    return <EmptyState icon={<LucideTv className="animate-pulse" />} title="Loading Channels" subtitle="Please wait while we parse your media sources..." />;
  }

  if (channels.length === 0) {
    return <EmptyState icon={<LucideTv />} title="No Channels Available" subtitle="Go to Settings > Sources to add an M3U playlist." />;
  }

  return (
    <div className="flex flex-col h-full w-full bg-transparent overflow-hidden">
      
      {/* ── TOP RIBBON: CATEGORIES & SEARCH ── */}
      <div className="h-16 flex-none bg-black/90 backdrop-blur-xl border-b border-gray-800 flex items-center px-4 gap-4 z-20">
        <CategoryRibbon 
          categories={categories} 
          activeCategory={activeCategory} 
          setActiveCategory={setActiveCategory} 
        />
        <div className="relative w-64 shrink-0">
          <LucideSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search channels..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      {/* ── MAIN SPLIT ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT SIDEBAR: CHANNEL LIST (VIRTUALIZED) */}
        <div className="w-[420px] flex-none bg-[#050c0e]/95 backdrop-blur-xl border-r border-gray-800 flex flex-col z-20 shadow-2xl">
          <div className="px-5 py-3 border-b border-gray-800/50 flex justify-between items-center text-xs text-gray-400 uppercase tracking-wider font-semibold">
            <span>{filteredChannels.length} Channels</span>
          </div>
          
          <div className="flex-1">
            {filteredChannels.length > 0 ? (
              <VirtualizedChannelList 
                channels={filteredChannels} 
                selectedChannel={selectedChannel}
                activeUrl={activeUrl}
                onSelect={handleSelectChannel}
                onPlay={handlePlayChannel}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                getEpgForChannel={getEpgForChannel}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <LucideSearch size={32} className="mb-2 opacity-50" />
                <p>No channels found.</p>
              </div>
            )}
          </div>
        </div>
        
        {/* RIGHT SIDE: PLAYER HOLE & EPG */}
        <div className="flex-1 flex flex-col relative">
          
          {/* TOP: NOW PLAYING (TRANSPARENT HOLE) */}
          {/* We leave this area completely transparent so Layer 0 (Player) shows through */}
          <div className="flex-1 bg-transparent pointer-events-none" />
          
          {/* BOTTOM: PROGRAM GUIDE / EPG */}
          <div className="h-72 flex-none bg-[#0a1f22]/95 backdrop-blur-2xl border-t border-gray-800 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
            {selectedChannel ? (
              <div className="h-full flex flex-col p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-4 mb-4">
                  <h2 className="text-2xl font-bold text-white truncate">{selectedChannel.name}</h2>
                  <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase rounded shadow-sm">Live</span>
                  <span className="text-gray-500 text-sm">{selectedChannel.groups[0] || 'Unknown'}</span>
                </div>
                
                {currentEpg.length > 0 ? (
                  <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                    {currentEpg.map((prog, i) => (
                      <div key={i} className="flex gap-4 group">
                        <div className="w-32 shrink-0 text-sm font-medium text-blue-400 pt-0.5">{prog.time}</div>
                        <div className="flex-1">
                          <h4 className="text-white font-semibold mb-1 group-hover:text-blue-300 transition-colors">{prog.title}</h4>
                          <p className="text-sm text-gray-400 line-clamp-2">{prog.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                    <LucideCalendarDays size={32} className="mb-3 opacity-30" />
                    <p>No program guide available for this channel.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 flex-col gap-3">
                <LucideTv size={32} className="opacity-30" />
                <span>Select a channel to view the program guide.</span>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function CategoryRibbon({ categories, activeCategory, setActiveCategory }) {
  const containerRef = useRef(null);

  const allTabs = ["All Channels", "Favorites", "Recently Watched", ...categories];

  return (
    <div 
      className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth" 
      ref={containerRef}
    >
      {allTabs.map(cat => {
        const isFav = cat === "Favorites";
        const isAll = cat === "All Channels";
        const isActive = 
          (isAll && activeCategory === null) || 
          (activeCategory === cat);

        return (
          <button
            key={cat}
            onClick={() => setActiveCategory(isAll ? null : cat)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              isActive 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            {isFav && <LucideHeart size={14} className={isActive ? 'text-white' : 'text-red-500'} />}
            {cat}
          </button>
        );
      })}
    </div>
  );
}

// Custom Virtualizer for 0-dependency, high-performance rendering
function VirtualizedChannelList({ channels, selectedChannel, activeUrl, onSelect, onPlay, favorites, onToggleFavorite, getEpgForChannel }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) setHeight(containerRef.current.clientHeight);
    const ob = new ResizeObserver(entries => {
      if (entries[0]) setHeight(entries[0].contentRect.height);
    });
    if (containerRef.current) {
      ob.observe(containerRef.current);
    }
    return () => ob.disconnect();
  }, []);

  const ITEM_HEIGHT = 72; // Increased for logo & richer card
  const totalHeight = channels.length * ITEM_HEIGHT;
  
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 3);
  const endIndex = Math.min(channels.length - 1, Math.ceil((scrollTop + height) / ITEM_HEIGHT) + 3);

  const visibleItems = [];
  
  for (let i = startIndex; i <= endIndex; i++) {
    const channel = channels[i];
    const isSelected = selectedChannel?.id === channel.id;
    const isPlaying = activeUrl === channel.url;
    const isFav = favorites.includes(channel.id);
    const epg = getEpgForChannel(channel.tvgId);
    const currentProgram = epg[0]?.title || "Unknown Program";

    visibleItems.push(
      <div 
        key={channel.id || i}
        style={{ position: 'absolute', top: i * ITEM_HEIGHT, left: 0, right: 0, height: ITEM_HEIGHT }}
        className="px-3 py-1"
      >
        <div 
          onClick={() => onSelect(channel)}
          onDoubleClick={() => onPlay(channel)}
          className={`h-full flex items-center px-3 rounded-xl cursor-pointer transition-colors group ${
            isSelected 
              ? 'bg-blue-600/10 border border-blue-500/30' 
              : 'hover:bg-white/5 border border-transparent'
          }`}
        >
          {/* Logo */}
          <div className="shrink-0 mr-3">
            <ChannelLogo url={channel.logo} name={channel.name} />
          </div>

          {/* Details */}
          <div className="truncate pr-2 flex-1">
            <div className="flex items-center gap-2">
              <div className={`font-semibold text-sm truncate ${isSelected ? 'text-blue-400' : 'text-gray-200'}`}>
                {channel.name}
              </div>
              {isPlaying && <span className="flex shrink-0 w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" title="Currently Playing"></span>}
            </div>
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {currentProgram}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={(e) => { e.stopPropagation(); onPlay(channel); }}
              className={`p-1.5 rounded-full transition-colors focus:outline-none ${
                isPlaying 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-blue-600/20 text-blue-400 opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:text-white'
              }`}
              title="Play Channel"
            >
              <LucidePlayCircle size={16} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(channel.id); }}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors focus:outline-none"
              title="Toggle Favorite"
            >
              <LucideHeart 
                size={16} 
                className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-600 opacity-0 group-hover:opacity-100'} 
              />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      onScroll={(e) => setScrollTop(e.target.scrollTop)}
      className="w-full h-full overflow-y-auto no-scrollbar relative"
    >
      <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
        {visibleItems}
      </div>
    </div>
  );
}

// Graceful fallback logo component
function ChannelLogo({ url, name }) {
  const [error, setError] = useState(false);

  if (!url || error) {
    // Fallback: Initial letter or Icon
    return (
      <div className="w-10 h-10 rounded bg-[#123236] border border-gray-700 flex items-center justify-center text-gray-400 shadow-inner">
        {name ? name.charAt(0).toUpperCase() : <LucideImageOff size={16} />}
      </div>
    );
  }

  return (
    <img 
      src={url} 
      alt={name} 
      onError={() => setError(true)}
      className="w-10 h-10 rounded object-contain bg-white/5 border border-gray-800"
      loading="lazy"
    />
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#050c0e] text-center p-8 z-20 relative">
      <div className="w-20 h-20 bg-blue-900/10 text-blue-500 rounded-full flex items-center justify-center mb-6 shadow-inner border border-blue-900/30">
        {React.cloneElement(icon, { size: 36 })}
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
      <p className="text-gray-400 max-w-md">{subtitle}</p>
    </div>
  );
}
