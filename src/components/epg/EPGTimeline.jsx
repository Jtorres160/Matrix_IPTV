import React from 'react';

export default function EPGTimeline() {
  // A static timeline placeholder to give it the streaming-app feel.
  // In a real implementation, this would calculate times dynamically based on the current hour.
  const now = new Date();
  const currentHour = now.getHours();
  const nextHour = (currentHour + 1) % 24;
  const nextNextHour = (currentHour + 2) % 24;

  const formatTime = (hour) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}:00 ${ampm}`;
  };

  return (
    <div className="flex w-full h-12 border-b border-gray-800 bg-black/80 backdrop-blur-md sticky top-0 z-20">
      {/* Spacer for channel info column */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 p-4 flex items-center justify-end text-xs text-gray-500 font-bold uppercase tracking-widest">
        Now
      </div>
      
      {/* Timeline markers */}
      <div className="flex-1 flex overflow-hidden pl-4 relative">
        <div className="w-[280px] shrink-0 flex items-center px-4 text-sm font-bold text-white border-l border-gray-800/50">
          {formatTime(currentHour)}
        </div>
        <div className="w-[280px] shrink-0 flex items-center px-4 text-sm font-bold text-gray-500 border-l border-gray-800/50">
          {formatTime(nextHour)}
        </div>
        <div className="w-[280px] shrink-0 flex items-center px-4 text-sm font-bold text-gray-500 border-l border-gray-800/50">
          {formatTime(nextNextHour)}
        </div>
        
        {/* Current Time Indicator line */}
        <div className="absolute left-[34px] top-0 bottom-0 w-px bg-red-600 z-30 shadow-[0_0_10px_rgba(220,38,38,1)]">
           <div className="absolute -left-1 top-0 w-2 h-2 rounded-full bg-red-600" />
        </div>
      </div>
    </div>
  );
}
