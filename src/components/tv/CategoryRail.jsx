import React from 'react';
import { LucideImageOff } from 'lucide-react';

export default function CategoryRail({ title, channels, onPlay }) {
  if (!channels || channels.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="text-xl font-bold text-gray-200 px-8 mb-2 tracking-tight">{title}</h2>
      <div className="flex overflow-x-auto no-scrollbar scroll-smooth gap-4 px-8 pb-4 pt-2">
        {channels.map((channel, idx) => (
          <button
            key={channel.id || idx}
            data-tv-focusable="true"
            onClick={() => onPlay(channel)}
            className="group relative flex-shrink-0 w-40 h-28 rounded-lg overflow-hidden bg-white/5 border border-transparent transition-all focus:outline-none focus:ring-4 focus:ring-blue-500 focus:z-10 focus:border-white/20 text-left hover:bg-white/10"
          >
            <div className="absolute inset-0 flex items-center justify-center p-3">
               {channel.logo ? (
                 <img src={channel.logo} className="w-full h-full object-contain opacity-40 group-focus:opacity-100 group-hover:opacity-100 transition-opacity" />
               ) : (
                 <LucideImageOff size={24} className="text-gray-700 opacity-50" />
               )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-2 flex flex-col justify-end">
              <h4 className="text-white font-semibold truncate text-xs drop-shadow-md">{channel.name}</h4>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
