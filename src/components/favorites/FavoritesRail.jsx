import React from 'react';
import { LucideImageOff, LucidePlayCircle } from 'lucide-react';
import FavoriteButton from './FavoriteButton.jsx';
import { resolveMediaItem } from '../../lib/media/mediaResolver.js';

export default function FavoritesRail({ favorites, onPlay }) {
  // Filter and map to actual media objects (live, movie, series)
  const favoriteChannels = favorites
    .map(id => resolveMediaItem(id))
    .filter(Boolean);

  if (favoriteChannels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white/5 rounded-xl border border-gray-800 border-dashed m-4">
        <p className="text-gray-400 font-medium">No favorites yet.</p>
        <p className="text-gray-500 text-sm mt-1">Press ☆ on any channel to save it here.</p>
      </div>
    );
  }

  return (
    <div className="flex overflow-x-auto no-scrollbar scroll-smooth gap-4 p-4">
      {favoriteChannels.map(channel => (
        <button
          key={channel.id}
          data-tv-focusable="true"
          onClick={() => onPlay(channel)}
          className="group relative flex-shrink-0 w-64 h-36 rounded-xl overflow-hidden bg-[#0c1618] border border-gray-800 transition-all focus:outline-none focus:ring-4 focus:ring-blue-500 focus:scale-[1.02] hover:scale-[1.02] text-left"
        >
          {/* Background / Logo Area */}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-black/80 to-transparent">
            {channel.logo ? (
              <img src={channel.logo} alt={channel.name} className="w-24 h-24 object-contain opacity-50 group-focus:opacity-100 group-hover:opacity-100 transition-opacity" onError={(e) => e.target.style.display = 'none'} />
            ) : (
              <LucideImageOff size={48} className="text-gray-700 opacity-50" />
            )}
          </div>
          
          {/* Hover / Focus Overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-focus:opacity-100 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <LucidePlayCircle size={48} className="text-white drop-shadow-lg" />
          </div>

          {/* Text Info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent">
            <div className="flex justify-between items-end">
              <div className="flex-1 truncate pr-2">
                <h4 className="text-white font-bold truncate text-lg drop-shadow-md">{channel.name}</h4>
                <p className="text-xs text-blue-400 font-medium truncate drop-shadow-md">{channel.groups?.[0]}</p>
              </div>
              <div className="shrink-0 relative z-10" onClick={e => e.stopPropagation()}>
                <FavoriteButton channelId={channel.id} isFavorite={true} />
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
