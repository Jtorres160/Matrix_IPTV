import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '../../player/playerStore.js';

export default function PlayerOverlay() {
  const { activeChannel } = usePlayerStore();
  const [visible, setVisible] = useState(false);
  const [displayChannel, setDisplayChannel] = useState(null);

  useEffect(() => {
    if (activeChannel) {
      setDisplayChannel(activeChannel);
      setVisible(true);
      
      const timer = setTimeout(() => {
        setVisible(false);
      }, 2500);
      
      return () => clearTimeout(timer);
    }
  }, [activeChannel]);

  if (!displayChannel) return null;

  return (
    <div 
      className={`absolute top-8 left-8 z-30 pointer-events-none transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="bg-black/80 backdrop-blur-md border border-gray-700/50 rounded-xl p-4 shadow-2xl min-w-[250px]">
        <h2 className="text-2xl font-bold text-white mb-1 drop-shadow-md">
          {displayChannel.name}
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
          <span className="text-blue-400">{displayChannel.groups?.[0] || 'Live'}</span>
          <span className="opacity-50">•</span>
          <span>1080p</span> {/* Placeholder until stream quality detection is implemented */}
        </div>
      </div>
    </div>
  );
}
