import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../player/playerStore.js';
import { analytics, tvEvents } from '../lib/tv/tvAnalytics.js';

const MAX_HISTORY = 10;

export function usePreviousChannel() {
  const activeChannel = usePlayerStore(s => s.activeChannel);
  const setChannel = usePlayerStore(s => s.setChannel);
  
  const historyRef = useRef([]);

  useEffect(() => {
    if (activeChannel) {
      const current = historyRef.current;
      // Ignore consecutive duplicates
      if (current.length === 0 || current[current.length - 1].id !== activeChannel.id) {
        current.push(activeChannel);
        if (current.length > MAX_HISTORY) {
          current.shift();
        }
      }
    }
  }, [activeChannel]);

  const switchToLastChannel = useCallback(() => {
    if (historyRef.current.length > 1) {
      // Pop current active channel
      historyRef.current.pop();
      // Get the previous one
      const prevChannel = historyRef.current.pop();
      
      if (prevChannel) {
        analytics.track(tvEvents.CHANNEL_SWITCH, { 
          from: activeChannel?.id, 
          channelId: prevChannel.id, 
          method: 'last' 
        });
        setChannel(prevChannel);
      }
    }
  }, [activeChannel, setChannel]);

  return { switchToLastChannel };
}
