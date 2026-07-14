import React from 'react';
import { LucideMaximize, LucideMinimize, LucideVolume2, LucideVolumeX, LucidePause, LucidePlay, LucideSettings } from 'lucide-react';
import { usePlayerStore } from '../../player/playerStore.js';

export default function PlayerControls() {
  const { 
    activeChannel, 
    playbackState, 
    isFullscreen, 
    volume, 
    muted, 
    showControls,
    play,
    pause,
    toggleFullscreen,
    setVolume,
    toggleMute,
    showControlsTemporarily
  } = usePlayerStore();

  if (!showControls || !activeChannel) return null;

  const isPlaying = playbackState === 'playing';

  return (
    <div 
      className="absolute inset-0 z-50 flex flex-col justify-between pointer-events-none"
      onMouseMove={showControlsTemporarily}
    >
      {/* TOP GRADIENT / HEADER */}
      <div className="w-full bg-gradient-to-b from-black/80 to-transparent p-6 flex justify-between items-start pointer-events-auto">
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-white drop-shadow-md">{activeChannel.name}</h2>
          <span className="text-gray-300 text-sm font-medium drop-shadow-md">
            {activeChannel.groups?.[0] || 'Unknown Category'}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-red-600/90 rounded text-xs font-bold tracking-widest uppercase text-white shadow-lg">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          Live
        </div>
      </div>

      {/* BOTTOM GRADIENT / CONTROLS */}
      <div className="w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 pb-8 pointer-events-auto flex flex-col gap-4">
        {/* Progress bar placeholder (Live TV doesn't really seek, but looks good) */}
        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-red-500 w-full rounded-full"></div>
        </div>

        <div className="flex items-center justify-between">
          
          {/* Left Controls */}
          <div className="flex items-center gap-6">
            <button 
              onClick={isPlaying ? pause : play}
              className="text-white hover:text-blue-400 transition-colors focus:outline-none"
            >
              {isPlaying ? <LucidePause size={28} /> : <LucidePlay size={28} />}
            </button>

            <div className="flex items-center gap-3 group">
              <button 
                onClick={toggleMute}
                className="text-white hover:text-blue-400 transition-colors focus:outline-none"
              >
                {muted || volume === 0 ? <LucideVolumeX size={24} /> : <LucideVolume2 size={24} />}
              </button>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-6">
            <button className="text-white hover:text-blue-400 transition-colors focus:outline-none">
              <LucideSettings size={22} />
            </button>
            <button 
              onClick={toggleFullscreen}
              className="text-white hover:text-blue-400 transition-colors focus:outline-none"
            >
              {isFullscreen ? <LucideMinimize size={24} /> : <LucideMaximize size={24} />}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
