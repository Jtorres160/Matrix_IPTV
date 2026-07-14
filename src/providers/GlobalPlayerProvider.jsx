import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const GlobalPlayerContext = createContext();

export function GlobalPlayerProvider({ children }) {
  const [activeStreamUrl, setActiveStreamUrl] = useState(() => {
    return localStorage.getItem('matrix_active_stream') || null;
  });
  const [activeChannelName, setActiveChannelName] = useState(() => {
    return localStorage.getItem('matrix_active_channel') || null;
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // If the stream contains a timeshift parameter (catch-up), do not persist it to avoid expired URL on next boot
    if (activeStreamUrl && !activeStreamUrl.includes('timeshift=')) {
      localStorage.setItem('matrix_active_stream', activeStreamUrl);
    } else {
      localStorage.removeItem('matrix_active_stream');
    }
    
    if (activeChannelName) {
      localStorage.setItem('matrix_active_channel', activeChannelName);
    }
  }, [activeStreamUrl, activeChannelName]);

  const playStream = useCallback((url, name) => {
    setActiveStreamUrl(url);
    setActiveChannelName(name);
    setIsPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(prev => !prev);
  }, []);

  return (
    <GlobalPlayerContext.Provider value={{ 
      activeStreamUrl, 
      activeChannelName, 
      playStream, 
      setActiveStreamUrl,
      isPlaying,
      volume,
      muted,
      togglePlay,
      setVolume,
      toggleMute
    }}>
      {children}
    </GlobalPlayerContext.Provider>
  );
}

export function useGlobalPlayer() {
  const context = useContext(GlobalPlayerContext);
  if (!context) {
    throw new Error('useGlobalPlayer must be used within a GlobalPlayerProvider');
  }
  return context;
}
