import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../player/playerStore.js';
import { useProfilesStore } from '../store/profileStore.ts';
import { analytics, tvEvents } from '../lib/tv/tvAnalytics.js';

export function useWatchSession() {
  const activeChannel = usePlayerStore(s => s.activeChannel);
  const playbackState = usePlayerStore(s => s.playbackState);
  const updateWatchHistory = useProfilesStore(s => s.updateWatchHistory);

  const sessionRef = useRef(null);

  useEffect(() => {
    // We only track session when actively playing
    if (playbackState !== 'playing' || !activeChannel) {
      if (sessionRef.current && sessionRef.current.channelId) {
        // Paused, buffering, or error -> pause timer
        sessionRef.current.lastTick = null;
      }
      return;
    }

    const channelId = activeChannel.id;

    // Start a new session if channel changed or first time
    if (!sessionRef.current || sessionRef.current.channelId !== channelId) {
      // Finalize previous session if exists
      if (sessionRef.current && sessionRef.current.channelId) {
        analytics.track(tvEvents.WATCH_SESSION_END, { channelId: sessionRef.current.channelId });
      }

      sessionRef.current = {
        channelId,
        startedAt: Date.now(),
        accumulatedSeconds: 0,
        lastTick: Date.now()
      };

      analytics.track(tvEvents.WATCH_SESSION_START, { channelId });
    } else {
      // Resuming playing same channel
      sessionRef.current.lastTick = Date.now();
    }

    // Tick every 10 seconds to accumulate duration and update store
    const intervalId = setInterval(() => {
      if (sessionRef.current && sessionRef.current.lastTick) {
        const now = Date.now();
        const deltaSeconds = Math.floor((now - sessionRef.current.lastTick) / 1000);
        
        if (deltaSeconds > 0) {
          sessionRef.current.accumulatedSeconds += deltaSeconds;
          sessionRef.current.lastTick = now;
          // Sync with the global store
          updateWatchHistory(sessionRef.current.channelId, deltaSeconds);
        }
      }
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeChannel, playbackState, updateWatchHistory]);

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current && sessionRef.current.channelId) {
        analytics.track(tvEvents.WATCH_SESSION_END, { channelId: sessionRef.current.channelId });
        sessionRef.current = null;
      }
    };
  }, []);
}
