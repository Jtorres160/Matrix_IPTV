import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore.js';
import { useActiveProfile, useProfilesStore } from '../profileStore.js';
import { LucideSearch, LucideHeart, LucidePlayCircle, LucideTv, LucideImageOff, LucideListVideo } from 'lucide-react';
import { usePlayerStore } from '../player/playerStore.js';
import FavoritesRail from './favorites/FavoritesRail.jsx';
import EPGOverlay from './epg/EPGOverlay.jsx';
import { useTVNavigation } from '../hooks/useTVNavigation.js';
import ContinueWatchingRail from './tv/ContinueWatchingRail.jsx';
import RecommendedRail from './tv/RecommendedRail.jsx';
import CategoryRail from './tv/CategoryRail.jsx';
import { rankContinueWatching, getRecommendedChannels } from '../lib/tv/channelRanking.js';
import { TV_CATEGORIES, getChannelsByCategory } from '../lib/tv/channelCategories.js';
import { useChannelInput } from '../hooks/useChannelInput.js';
import { useWatchSession } from '../hooks/useWatchSession.js';
import { useTVBackNavigation } from '../hooks/useTVBackNavigation.js';

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
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  
  const activeProfile = useActiveProfile();
  const toggleFavorite = useProfilesStore((s) => s.toggleFavorite);
  const addRecentlyWatched = useProfilesStore((s) => s.addRecentlyWatched);
  
  const favorites = activeProfile?.favorites || [];
  const watchHistory = activeProfile?.watchHistory || [];
  const recentlyWatchedItems = activeProfile?.recentlyWatched || [];
  
  const { activeUrl, setChannel, setPlaylist, playlist, activeChannel } = usePlayerStore();

  // Sync playlist to playerStore for navigation
  useEffect(() => {
    if (playlist.length !== channels.length) {
      setPlaylist(channels);
    }
  }, [channels, playlist.length, setPlaylist]);

  // Remote-first TV navigation for the main view
  useTVNavigation({
    isActive: !isGuideOpen && !isLoadingPlaylist && channels.length > 0,
    onGuideOpen: () => setIsGuideOpen(true)
  });

  // Channel number entry and switching
  useChannelInput(!isGuideOpen && !isLoadingPlaylist && channels.length > 0);
  
  // Session tracking
  useWatchSession();
  
  // Back navigation hierarchy
  useTVBackNavigation({
    isEPGOpen: isGuideOpen,
    closeEPG: () => setIsGuideOpen(false)
  });

  // Filtering for All Channels list
  const filteredChannels = useMemo(() => {
    let result = channels;
    if (activeCategory) {
      result = result.filter(c => c.groups.includes(activeCategory));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(q) || 
        c.groups.some(g => g.toLowerCase().includes(q))
      );
    }
    return result;
  }, [channels, activeCategory, searchQuery]);

  const getEpgForChannel = (tvgId) => {
    return epgData.get(tvgId) || [];
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

  // NEW RANKING AND INTELLIGENCE
  const continueWatching = useMemo(() => {
    const historyToUse = watchHistory.length > 0 ? watchHistory : recentlyWatchedItems;
    return rankContinueWatching(historyToUse, channels);
  }, [watchHistory, recentlyWatchedItems, channels]);

  const recommendedChannels = useMemo(() => {
    const historyToUse = watchHistory.length > 0 ? watchHistory : recentlyWatchedItems;
    return getRecommendedChannels(channels, historyToUse, favorites);
  }, [channels, watchHistory, recentlyWatchedItems, favorites]);

  // Pre-calculate some category rails
  const sportsChannels = useMemo(() => getChannelsByCategory(channels, TV_CATEGORIES.SPORTS), [channels]);
  const newsChannels = useMemo(() => getChannelsByCategory(channels, TV_CATEGORIES.NEWS), [channels]);
  const moviesChannels = useMemo(() => getChannelsByCategory(channels, TV_CATEGORIES.MOVIES), [channels]);

  // Chronological recently watched for the old rail
  const chronologicalHistory = useMemo(() => {
    const historyToUse = watchHistory.length > 0 ? watchHistory : recentlyWatchedItems;
    return [...historyToUse]
      .sort((a, b) => (b.lastWatchedAt || b.timestamp || 0) - (a.lastWatchedAt || a.timestamp || 0))
      .map(item => {
        const id = typeof item === 'string' ? item : (item.channelId || item.id);
        return {
          channel: channels.find(c => c.id === id),
          timestamp: item.lastWatchedAt || item.timestamp || Date.now(),
          watchDuration: item.totalWatchSeconds || item.watchDuration || 0
        };
      })
      .filter(x => x.channel);
  }, [watchHistory, recentlyWatchedItems, channels]);

  return (
    <div className="flex flex-col h-full w-full bg-transparent overflow-y-auto no-scrollbar relative z-10 scroll-smooth">
      
      {/* ── LIVE TV HERO (TRANSPARENT HOLE) ── */}
      {/* Takes up most of the screen, allowing Layer 0 video to shine through */}
      <div className="w-full h-[60vh] flex flex-col justify-between p-12 bg-gradient-to-b from-black/80 via-transparent to-black pointer-events-none">
        
        {/* Top Header Layer */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div className="flex gap-4 items-center">
            <button 
              data-tv-focusable="true"
              onClick={() => setIsGuideOpen(true)}
              className="px-6 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white font-bold transition-all focus:outline-none focus:ring-4 focus:ring-blue-500 flex items-center gap-2"
            >
              <LucideListVideo size={18} />
              Open Guide (G)
            </button>
          </div>
          
          <div className="relative w-64 shrink-0">
            <LucideSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/50 backdrop-blur-md border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>

        {/* Bottom Hero Layer (Context for currently playing video) */}
        {activeChannel ? (
           <div className="pointer-events-auto mb-8">
              <span className="px-3 py-1 bg-red-600 text-white text-xs font-bold tracking-widest uppercase rounded shadow-sm mb-3 inline-block">Live</span>
              <h1 className="text-6xl font-black text-white drop-shadow-2xl max-w-4xl tracking-tight mb-2">
                {activeChannel.name}
              </h1>
              <p className="text-xl text-gray-300 drop-shadow-md font-medium">
                {activeChannel.groups?.[0]}
              </p>
           </div>
        ) : (
          <div className="pointer-events-auto mb-8">
            <h1 className="text-5xl font-black text-white drop-shadow-2xl tracking-tight mb-2">Live TV</h1>
            <p className="text-xl text-gray-300 drop-shadow-md">Select a channel to start watching.</p>
          </div>
        )}
      </div>

      {/* ── HOME LAYOUT SECTIONS ── */}
      <div className="w-full min-h-[40vh] bg-[#050c0e] flex flex-col pb-20 relative z-20 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
        
        {/* CONTINUE WATCHING */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-white px-8 mb-2 tracking-tight">Continue Watching</h2>
          <ContinueWatchingRail historyItems={continueWatching} onPlay={handlePlayChannel} />
        </div>

        {/* BECAUSE YOU WATCH */}
        {recommendedChannels.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-white px-8 mb-2 tracking-tight">Because You Watch</h2>
            <RecommendedRail channels={recommendedChannels} onPlay={handlePlayChannel} />
          </div>
        )}

        {/* CATEGORY RAILS */}
        {sportsChannels.length > 0 && (
          <CategoryRail title="Sports" channels={sportsChannels} onPlay={handlePlayChannel} />
        )}
        {moviesChannels.length > 0 && (
          <CategoryRail title="Movies" channels={moviesChannels} onPlay={handlePlayChannel} />
        )}
        {newsChannels.length > 0 && (
          <CategoryRail title="News" channels={newsChannels} onPlay={handlePlayChannel} />
        )}

        {/* FAVORITES */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-white px-8 mb-2 tracking-tight">Favorites</h2>
          <FavoritesRail channels={channels} favorites={favorites} onPlay={handlePlayChannel} />
        </div>

        {/* RECENTLY WATCHED */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-400 px-8 mb-2 tracking-tight">Recently Watched</h2>
           {chronologicalHistory.length > 0 ? (
            <div className="flex overflow-x-auto no-scrollbar scroll-smooth gap-4 px-8 pb-4 pt-2 opacity-70">
              {chronologicalHistory.map(({channel, timestamp}, idx) => (
                <button
                  key={idx}
                  data-tv-focusable="true"
                  onClick={() => handlePlayChannel(channel)}
                  className="group relative flex-shrink-0 w-48 h-24 rounded-lg overflow-hidden bg-white/5 border border-transparent transition-all focus:outline-none focus:ring-4 focus:ring-blue-500 focus:z-10 focus:border-white/20 text-left hover:bg-white/10"
                >
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                     {channel.logo ? (
                       <img src={channel.logo} className="w-full h-full object-contain opacity-40 group-focus:opacity-100 group-hover:opacity-100 transition-opacity" />
                     ) : (
                       <LucideImageOff size={32} className="text-gray-700 opacity-50" />
                     )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-3 flex flex-col justify-end">
                    <h4 className="text-white font-bold truncate text-sm drop-shadow-md">{channel.name}</h4>
                  </div>
                </button>
              ))}
            </div>
          ) : (
             <div className="px-8 py-2 text-gray-500 italic text-sm">
                No recent channels.
             </div>
          )}
        </div>

        {/* ALL CHANNELS (CATEGORIES & VIRTUALIZED LIST) */}
        <div className="mt-8 flex-1 flex flex-col px-8">
          <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">All Channels</h2>
          
          <CategoryRibbon 
            categories={categories} 
            activeCategory={activeCategory} 
            setActiveCategory={setActiveCategory} 
          />
          
          <div className="mt-6 flex-1 min-h-[500px]">
             {filteredChannels.length > 0 ? (
               <VirtualizedChannelList 
                 channels={filteredChannels} 
                 activeUrl={activeUrl}
                 onPlay={handlePlayChannel}
                 favorites={favorites}
                 onToggleFavorite={toggleFavorite}
                 getEpgForChannel={getEpgForChannel}
               />
             ) : (
               <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                 <LucideSearch size={32} className="mb-2 opacity-50" />
                 <p>No channels found.</p>
               </div>
             )}
          </div>
        </div>

      </div>

      {/* EPG Overlay Modal */}
      <EPGOverlay 
        isOpen={isGuideOpen} 
        onClose={() => setIsGuideOpen(false)} 
        channels={channels}
        epgData={epgData}
        activeChannel={activeChannel}
        onPlayChannel={handlePlayChannel}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function CategoryRibbon({ categories, activeCategory, setActiveCategory }) {
  const containerRef = useRef(null);

  return (
    <div 
      className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth pb-2" 
      ref={containerRef}
    >
      <button
        data-tv-focusable="true"
        onClick={() => setActiveCategory(null)}
        className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-bold transition-all focus:outline-none focus:ring-4 focus:ring-blue-500 ${
          activeCategory === null
            ? 'bg-blue-600 text-white shadow-lg' 
            : 'bg-white/5 text-gray-300 hover:bg-white/10'
        }`}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat}
          data-tv-focusable="true"
          onClick={() => setActiveCategory(cat)}
          className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-bold transition-all focus:outline-none focus:ring-4 focus:ring-blue-500 ${
            activeCategory === cat 
              ? 'bg-blue-600 text-white shadow-lg' 
              : 'bg-white/5 text-gray-300 hover:bg-white/10'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

// Custom Virtualizer for full window scrolling compatibility
function VirtualizedChannelList({ channels, activeUrl, onPlay, favorites, onToggleFavorite, getEpgForChannel }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600); // Default assumption for the block
  const containerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        // Calculate the scroll position relative to the container
        const rect = containerRef.current.getBoundingClientRect();
        // Since the main view scrolls, we use bounding client rect to determine visible area
        // A full virtualization requires more math, but a simplified sliding window works well
        const offsetTop = -rect.top + window.innerHeight * 0.5; // Rough estimate of view center
        setScrollTop(Math.max(0, offsetTop));
      }
    };
    
    // Listen to parent scroll container (the main div)
    const parent = document.querySelector('.overflow-y-auto');
    if (parent) {
      parent.addEventListener('scroll', handleScroll, { passive: true });
      return () => parent.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const ITEM_HEIGHT = 80; 
  const totalHeight = channels.length * ITEM_HEIGHT;
  
  // Very generous buffer to account for the simplified scroll logic
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 10);
  const endIndex = Math.min(channels.length - 1, startIndex + 30);

  const visibleItems = [];
  
  for (let i = startIndex; i <= endIndex; i++) {
    const channel = channels[i];
    const isPlaying = activeUrl === channel.url;
    const isFav = favorites.includes(channel.id);
    const epg = getEpgForChannel(channel.tvgId);
    const currentProgram = epg[0]?.title || "Unknown Program";

    visibleItems.push(
      <div 
        key={channel.id || i}
        style={{ position: 'absolute', top: i * ITEM_HEIGHT, left: 0, right: 0, height: ITEM_HEIGHT }}
        className="py-1"
      >
        <div 
          data-tv-focusable="true"
          onClick={() => onPlay(channel)}
          className={`h-full flex items-center px-4 rounded-xl cursor-pointer transition-all group focus:outline-none focus:ring-4 focus:ring-blue-500 focus:z-10 ${
            isPlaying 
              ? 'bg-blue-600/20 border-l-4 border-blue-500' 
              : 'hover:bg-white/5 bg-white/5 border-l-4 border-transparent'
          }`}
        >
          {/* Logo */}
          <div className="shrink-0 mr-4 w-12 h-12 rounded bg-black/40 flex items-center justify-center p-1">
             {channel.logo ? (
               <img src={channel.logo} className="w-full h-full object-contain" onError={(e) => e.target.style.display = 'none'} />
             ) : (
               <LucideImageOff size={20} className="text-gray-600" />
             )}
          </div>

          {/* Details */}
          <div className="truncate pr-4 flex-1">
            <div className="flex items-center gap-3">
              <h3 className={`font-bold text-lg truncate ${isPlaying ? 'text-blue-400' : 'text-gray-100'}`}>
                {channel.name}
              </h3>
              {isPlaying && <span className="flex shrink-0 w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>}
            </div>
            <p className="text-sm text-gray-400 truncate mt-0.5">
              {currentProgram}
            </p>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button 
              data-tv-focusable="true"
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(channel.id); }}
              className="p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white z-20"
              title="Toggle Favorite"
            >
              <LucideHeart 
                size={20} 
                className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-600 opacity-50 group-hover:opacity-100'} 
              />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full relative">
      <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
        {visibleItems}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#050c0e] text-center p-8 z-20 relative">
      <div className="w-24 h-24 bg-blue-900/10 text-blue-500 rounded-full flex items-center justify-center mb-6 shadow-inner border border-blue-900/30">
        {React.cloneElement(icon, { size: 48 })}
      </div>
      <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">{title}</h2>
      <p className="text-gray-400 max-w-md">{subtitle}</p>
    </div>
  );
}
