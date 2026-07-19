import React from 'react';
import { LucideImageOff } from 'lucide-react';

export default function RecommendedRail({ channels, onPlay }) {
  if (!channels || channels.length === 0) return null;

  return (
    <div className="flex overflow-x-auto no-scrollbar scroll-smooth gap-4 px-8 pb-4 pt-2">
      {channels.map((channel, idx) => (
        <button
          key={channel.id || idx}
          data-tv-focusable="true"
          onClick={() => onPlay(channel)}
          className="u-tile u-focus group relative flex-shrink-0 w-48 h-32 rounded-xl overflow-hidden focus:z-10 text-left"
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
  );
}
