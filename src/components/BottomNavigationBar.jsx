import React from 'react';
import { Tv, LayoutList, Film, ListVideo, ListMusic, Settings, Search, Disc } from 'lucide-react';

// NOTE: no 'favorites' entry — there is no route for it (favorites live as a
// rail inside Live TV and a category in Channels). A menu item without a
// route renders a blank screen. 'search' has no route either — it opens the
// global command palette (handled in supreme_layout's onSelect).
const MENU_ITEMS = [
  { id: 'live-tv', label: 'Live TV', icon: Tv },
  { id: 'channels', label: 'Channels', icon: LayoutList },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'series', label: 'Series', icon: ListVideo },
  { id: 'recordings', label: 'Recordings', icon: Disc },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export default function BottomNavigationBar({ activeZone, onSelect, currentView }) {
  return (
    <nav 
      className="fixed bottom-0 left-0 w-full bg-[#0f0f14]/95 backdrop-blur-md border-t border-white/10 z-50 flex justify-around items-center h-16 px-2 md:hidden"
    >
      {MENU_ITEMS.map((item, index) => {
        const isActive = currentView === item.id;
        
        return (
          <button
            key={item.id}
            data-nav-zone="bottom-nav"
            data-nav-index={index}
            onClick={() => onSelect && onSelect(item.id)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive ? 'text-[#00e5ff]' : 'text-[#8a8a93] hover:text-white'}`}
          >
            <item.icon size={22} className={isActive ? 'text-[#00e5ff]' : 'text-current'} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
