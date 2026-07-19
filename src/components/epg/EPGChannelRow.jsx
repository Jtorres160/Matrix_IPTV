import React, { useRef, useEffect } from 'react';
import ProgramCard from './ProgramCard.jsx';
import { LucideImageOff } from 'lucide-react';

export default function EPGChannelRow({ channel, programs, onPlay, onSchedule }) {
  const scrollRef = useRef(null);

  // A basic component to display channel info + program ribbon
  return (
    <div className="flex w-full mb-2 group">
      
      {/* Channel Info Header (Sticky Left) */}
      <div 
        className="w-64 flex-shrink-0 bg-black/60 backdrop-blur-md border-r border-gray-800 p-4 flex items-center gap-4 z-10"
      >
        <div className="w-12 h-12 rounded bg-[#123236] border border-gray-700 flex items-center justify-center text-gray-400 shrink-0 shadow-inner overflow-hidden">
          {channel.logo ? (
            <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain bg-white/5" onError={(e) => e.target.style.display = 'none'} />
          ) : (
             <LucideImageOff size={20} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm truncate">{channel.name}</h3>
          <p className="text-xs text-gray-400 truncate">{channel.groups?.[0] || 'Live TV'}</p>
        </div>
      </div>

      {/* Program Ribbon */}
      <div 
        className="flex-1 flex overflow-x-auto no-scrollbar scroll-smooth pl-4 py-2"
        ref={scrollRef}
      >
        {programs && programs.length > 0 ? (
          programs.map((prog, i) => (
            <ProgramCard
              key={i}
              program={prog}
              isLive={i === 0}
              onClick={() => onPlay(channel)}
              onSchedule={onSchedule ? (program) => onSchedule(program, channel) : undefined}
            />
          ))
        ) : (
          <div className="flex items-center text-sm text-gray-600 italic px-4">
            No program guide data available.
          </div>
        )}
      </div>

    </div>
  );
}
