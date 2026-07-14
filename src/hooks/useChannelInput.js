import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../player/playerStore.js';
import { useAppStore } from '../store/appStore.js';
import { analytics, tvEvents } from '../lib/tv/tvAnalytics.js';

export function useChannelInput(isActive = true) {
  const [channelNumber, setChannelNumber] = useState('');
  const timeoutRef = useRef(null);
  
  const playlist = usePlayerStore(s => s.playlist);
  const activeUrl = usePlayerStore(s => s.activeUrl);
  const setChannel = usePlayerStore(s => s.setChannel);
  const setSelectedChannel = useAppStore(s => s.setSelectedChannel);
  
  // We keep track of history to support "LAST" button
  const channelHistory = useRef([]);
  
  // Track active channel changes to keep history updated
  useEffect(() => {
    if (activeUrl) {
      const current = channelHistory.current;
      if (current[current.length - 1] !== activeUrl) {
        current.push(activeUrl);
        if (current.length > 50) current.shift(); // keep size manageable
      }
    }
  }, [activeUrl]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      // Don't interfere if typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const isNumber = /^[0-9]$/.test(e.key);
      
      if (isNumber) {
        setChannelNumber(prev => prev + e.key);
        
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        
        timeoutRef.current = setTimeout(() => {
          submitChannelNumber(channelNumber + e.key);
        }, 2000); // Wait 2s for more digits
      } else if (e.key === 'Enter' && channelNumber) {
        e.preventDefault();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        submitChannelNumber(channelNumber);
      } else if (e.key === 'Backspace' && !channelNumber) {
         // Some remotes map Back to Last Channel
         switchToLastChannel();
      } else if (e.key === 'l' || e.key === 'L') {
         // Keyboard mapping for LAST
         switchToLastChannel();
      } else if (e.key === 'ArrowUp' || e.key === 'ChannelUp') {
        // Channel up (only if no focus on interactive elements other than body/player)
        if (document.activeElement === document.body) {
           switchChannel(-1); // Up means previous index in playlist (usually higher number conceptually, or lower index physically. Let's say -1 is going up in the list).
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ChannelDown') {
        if (document.activeElement === document.body) {
           switchChannel(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, channelNumber, playlist, activeUrl]);

  const submitChannelNumber = (numStr) => {
    setChannelNumber('');
    // For now, match by index + 1 (e.g. 1 = first channel)
    // Could be updated to match channel.tvg.chno in the future
    const index = parseInt(numStr, 10) - 1;
    if (index >= 0 && index < playlist.length) {
      const channel = playlist[index];
      analytics.track(tvEvents.CHANNEL_SWITCH, { from: activeUrl, to: channel.id, method: 'number' });
      setChannel(channel);
      setSelectedChannel(channel);
    }
  };

  const switchChannel = (direction) => {
    if (!playlist.length) return;
    const currentIndex = playlist.findIndex(c => c.url === activeUrl);
    if (currentIndex === -1) {
        // if no channel active, play first
        setChannel(playlist[0]);
        setSelectedChannel(playlist[0]);
        return;
    }
    
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = playlist.length - 1;
    if (nextIndex >= playlist.length) nextIndex = 0;
    
    const nextChannel = playlist[nextIndex];
    analytics.track(tvEvents.CHANNEL_SWITCH, { from: activeUrl, to: nextChannel.id, method: 'updown' });
    setChannel(nextChannel);
    setSelectedChannel(nextChannel);
  };
  
  const switchToLastChannel = () => {
     if (channelHistory.current.length > 1) {
         // Pop current
         channelHistory.current.pop();
         // Get previous
         const prevUrl = channelHistory.current.pop();
         const prevChannel = playlist.find(c => c.url === prevUrl);
         if (prevChannel) {
             analytics.track(tvEvents.CHANNEL_SWITCH, { from: activeUrl, to: prevChannel.id, method: 'last' });
             setChannel(prevChannel);
             setSelectedChannel(prevChannel);
         }
     }
  };

  return { channelNumber };
}
