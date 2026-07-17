import React from 'react';
import { usePlayerStore } from '../../player/playerStore.js';
import { useAppStore } from '../../store/appStore.js';
import { LucideLoader2, LucideAlertCircle, LucideSkipForward, LucideArrowLeft } from 'lucide-react';

export default function PlayerStatus() {
  const { playbackState, errorInfo, activeChannel, reconnecting, nextChannel } = usePlayerStore();

  if (!activeChannel || playbackState === 'idle' || playbackState === 'playing') {
    return null;
  }

  // While reconnecting we keep retrying automatically; only once we've given up
  // do we offer the manual escape hatch.
  const isFatalError = playbackState === 'error' && !reconnecting;
  const isRetrying = playbackState === 'error' && reconnecting;

  const exitToLiveTV = () => {
    const app = useAppStore.getState();
    app.setIsImmersivePlayer(false);
    if (app.currentView === 'player') app.setCurrentView('live-tv');
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 pointer-events-none backdrop-blur-sm">
      <div className="bg-black/80 border border-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center max-w-sm w-full text-center shadow-2xl pointer-events-auto">

        {playbackState === 'error' && (
          <>
            <LucideAlertCircle size={48} className="text-red-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-1">
              {isFatalError ? "Can't play this channel" : 'Reconnecting…'}
            </h3>
            <p className="text-sm text-gray-400">
              {isFatalError
                ? (errorInfo || 'The stream may be offline or geo-blocked.')
                : (errorInfo || 'Trying to restore the stream…')}
            </p>

            {isRetrying && (
              <LucideLoader2 size={20} className="text-gray-500 mt-4 animate-spin" />
            )}

            {isFatalError && (
              <div className="flex gap-3 mt-5 w-full">
                <button
                  onClick={() => nextChannel()}
                  data-tv-focusable="true"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <LucideSkipForward size={15} />
                  Try Next Channel
                </button>
                <button
                  onClick={exitToLiveTV}
                  data-tv-focusable="true"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  <LucideArrowLeft size={15} />
                  Back
                </button>
              </div>
            )}
          </>
        )}

        {playbackState === 'paused' && (
          <h3 className="text-2xl font-bold text-white uppercase tracking-widest opacity-80">Paused</h3>
        )}
      </div>
    </div>
  );
}
