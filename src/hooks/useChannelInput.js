import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore } from '../player/playerStore.js';
import { useAppStore } from '../store/appStore.js';
import { analytics, tvEvents } from '../lib/tv/tvAnalytics.js';
import { usePreviousChannel } from './usePreviousChannel.js';
import { isEditableElement } from '../lib/tv/isEditableElement.js';

const CHANNEL_INPUT_TIMEOUT = 3000;

export function useChannelInput(isActive = true) {
  const [channelNumber, setChannelNumber] = useState('');
  const timeoutRef = useRef(null);
  
  const playlist = usePlayerStore(s => s.playlist);
  const activeUrl = usePlayerStore(s => s.activeUrl);
  const setChannel = usePlayerStore(s => s.setChannel);
  const setSelectedChannel = useAppStore(s => s.setSelectedChannel);
  const setIsImmersivePlayer = useAppStore(s => s.setIsImmersivePlayer);
  
  const { switchToLastChannel } = usePreviousChannel();

  const submitChannelNumber = useCallback((numStr) => {
    setChannelNumber('');
    const index = parseInt(numStr, 10) - 1;
    if (index >= 0 && index < playlist.length) {
      const channel = playlist[index];
      analytics.track(tvEvents.CHANNEL_SWITCH_STARTED, { 
        channelId: channel.id, 
        method: 'number',
        input: numStr 
      });
      setChannel(channel);
      setSelectedChannel(channel);
      setIsImmersivePlayer(true);
    }
  }, [playlist, setChannel, setSelectedChannel, setIsImmersivePlayer]);

  const switchChannel = useCallback((direction) => {
    if (!playlist.length) return;
    const currentIndex = playlist.findIndex(c => c.url === activeUrl);
    if (currentIndex === -1) {
        setChannel(playlist[0]);
        setSelectedChannel(playlist[0]);
        return;
    }
    
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = playlist.length - 1;
    if (nextIndex >= playlist.length) nextIndex = 0;
    
    const nextChannel = playlist[nextIndex];
    analytics.track(tvEvents.CHANNEL_SWITCH_STARTED, { 
      channelId: nextChannel.id, 
      method: direction > 0 ? 'ch_down' : 'ch_up' 
    });
    setChannel(nextChannel);
    setSelectedChannel(nextChannel);
    setIsImmersivePlayer(true);
  }, [playlist, activeUrl, setChannel, setSelectedChannel, setIsImmersivePlayer]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      if (isEditableElement(e.target)) return;

      const isNumber = /^[0-9]$/.test(e.key);
      
      if (isNumber) {
        const newNum = channelNumber + e.key;
        setChannelNumber(newNum);
        
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        
        timeoutRef.current = setTimeout(() => {
          submitChannelNumber(newNum);
        }, CHANNEL_INPUT_TIMEOUT);
      } else if (e.key === 'Enter' && channelNumber) {
        e.preventDefault();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        submitChannelNumber(channelNumber);
      } else if (e.key === 'Backspace' && !channelNumber) {
         switchToLastChannel();
      } else if (e.key === 'l' || e.key === 'L') {
         switchToLastChannel();
      } else if (e.key === 'ArrowUp' || e.key === 'ChannelUp') {
        if (document.activeElement === document.body) {
           e.preventDefault();
           switchChannel(-1);
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ChannelDown') {
        if (document.activeElement === document.body) {
           e.preventDefault();
           switchChannel(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, channelNumber, submitChannelNumber, switchChannel, switchToLastChannel]);

  return { channelNumber };
}
