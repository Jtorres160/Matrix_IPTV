import React from 'react';
import { LucideImageOff } from 'lucide-react';

export default function ContinueWatchingRail({ historyItems, onPlay }) {
  if (!historyItems || historyItems.length === 0) {
    return (
      <div className="px-8 py-6 text-gray-500 italic text-sm">
        Start watching channels. Your history will appear here.
      </div>
    );
  }

  return (
    <div className="flex overflow-x-auto no-scrollbar scroll-smooth gap-4 px-8 pb-4 pt-2">
      {historyItems.map((item, idx) => {
        const channel = item.channel;
        if (!channel) return null;
        
        // Session Insights
        const sessions = item.sessions || 1;
        const now = Date.now();
        const lastWatchedAt = item.lastWatchedAt || item.timestamp || now;
        const diffMinutes = Math.floor((now - lastWatchedAt) / 60000);
        
        let timeAgoText = '';
        if (diffMinutes < 1) timeAgoText = 'Just now';
        else if (diffMinutes < 60) timeAgoText = `${diffMinutes} mins ago`;
        else if (diffMinutes < 1440) timeAgoText = `${Math.floor(diffMinutes / 60)} hrs ago`;
        else timeAgoText = `${Math.floor(diffMinutes / 1440)} days ago`;

        const freqText = sessions > 1 ? `Watched ${sessions} times` : 'Watched 1 time';
        const mins = Math.floor((item.totalWatchSeconds || item.watchDuration || 0) / 60);
        const durationText = mins > 0 ? ` • ${mins}m total` : '';
        
        return (
          <button
            key={channel.id || idx}
            data-tv-focusable="true"
            onClick={() => onPlay(channel)}
            className="u-tile u-focus group relative flex-shrink-0 w-64 h-36 rounded-xl overflow-hidden focus:z-10 text-left"
          >
            <div className="absolute inset-0 flex items-center justify-center p-4">
               {channel.logo ? (
                 <img src={channel.logo} className="w-full h-full object-contain opacity-40 group-focus:opacity-100 group-hover:opacity-100 transition-opacity" />
               ) : (
                 <LucideImageOff size={48} className="text-gray-700 opacity-50" />
               )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 flex flex-col justify-end">
              <h4 className="text-white font-bold truncate text-lg drop-shadow-md">{channel.name}</h4>
              <p className="text-[11px] text-[#E8B15A] font-medium truncate mt-1">
                {freqText}{durationText}
              </p>
              <p className="text-[11px] text-[#A1A1AA] truncate">
                Last watched: {timeAgoText}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
