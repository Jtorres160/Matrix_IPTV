import React from 'react';
import { usePlayerStore } from '../../player/playerStore.js';
import { LucideLoader2, LucideAlertCircle } from 'lucide-react';

export default function PlayerStatus() {
  const { playbackState, errorInfo, activeChannel } = usePlayerStore();

  if (!activeChannel || playbackState === 'idle' || playbackState === 'playing') {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-none backdrop-blur-sm">
      <div className="bg-black/80 border border-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center max-w-sm w-full text-center shadow-2xl">
        
        {playbackState === 'buffering' && (
          <>
            <LucideLoader2 size={48} className="text-blue-500 animate-spin mb-4" />
            <h3 className="text-xl font-semibold text-white mb-1">Connecting...</h3>
            <p className="text-sm text-gray-400">Tuning to {activeChannel.name}</p>
          </>
        )}

        {playbackState === 'error' && (
          <>
            <LucideAlertCircle size={48} className="text-red-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-1">Playback Error</h3>
            <p className="text-sm text-gray-400">{errorInfo || "Unable to play stream"}</p>
          </>
        )}

        {playbackState === 'paused' && (
          <>
            <h3 className="text-2xl font-bold text-white uppercase tracking-widest opacity-80">Paused</h3>
          </>
        )}
      </div>
    </div>
  );
}
