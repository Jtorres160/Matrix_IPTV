import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { usePlayerStore } from '../player/playerStore.js';
import PlayerControls from './player/PlayerControls.jsx';
import PlayerStatus from './player/PlayerStatus.jsx';
import PlayerOverlay from './player/PlayerOverlay.jsx';

export default function PlayerPreview({ playerPreference }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);

  const {
    activeUrl,
    activeChannel,
    playbackState,
    volume,
    muted,
    isFullscreen,
    currentMode,
    play,
    pause,
    setPlaybackState,
    toggleFullscreen,
    setFullscreen,
    handleError,
    forceShowControls,
    showControlsTemporarily,
    toggleMute,
    setVolume,
    toggleTheater,
    previousChannel,
    nextChannel
  } = usePlayerStore();

  const [vlcAvailable, setVlcAvailable] = useState(false);

  // Initial setup / VLC check
  useEffect(() => {
    if (window.electronVLC) {
      window.electronVLC.check().then(result => {
        setVlcAvailable(result.available);
      }).catch(console.error);
    }
  }, []);

  // Sync state to native fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [setFullscreen]);

  useEffect(() => {
    if (isFullscreen && containerRef.current && !document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else if (!isFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    }
  }, [isFullscreen]);

  // Store state in a ref to avoid re-binding keyboard listeners on every state change
  const stateRef = useRef({
    activeChannel, playbackState, isFullscreen, volume,
    play, pause, toggleFullscreen, toggleMute, setVolume,
    showControlsTemporarily, setFullscreen, toggleTheater,
    previousChannel, nextChannel
  });

  useEffect(() => {
    stateRef.current = {
      activeChannel, playbackState, isFullscreen, volume,
      play, pause, toggleFullscreen, toggleMute, setVolume,
      showControlsTemporarily, setFullscreen, toggleTheater,
      previousChannel, nextChannel
    };
  }, [
    activeChannel, playbackState, isFullscreen, volume,
    play, pause, toggleFullscreen, toggleMute, setVolume,
    showControlsTemporarily, setFullscreen, toggleTheater,
    previousChannel, nextChannel
  ]);

  // Keyboard Shortcuts Engine
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input or textarea
      const tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) {
        return;
      }

      const {
        activeChannel, playbackState, isFullscreen, volume,
        play, pause, toggleFullscreen, toggleMute, setVolume,
        showControlsTemporarily, setFullscreen, toggleTheater,
        previousChannel, nextChannel
      } = stateRef.current;

      // Ignore if no active channel (we shouldn't steal keys when idle)
      if (!activeChannel) return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          playbackState === 'playing' ? pause() : play();
          showControlsTemporarily();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          showControlsTemporarily();
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(volume + 0.1);
          showControlsTemporarily();
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(volume - 0.1);
          showControlsTemporarily();
          break;
        case 'arrowleft':
          e.preventDefault();
          previousChannel();
          break;
        case 'arrowright':
          e.preventDefault();
          nextChannel();
          break;
        case 'escape':
          if (isFullscreen) {
            // Browser handles exiting native fullscreen, but we sync state
            setFullscreen(false);
          }
          break;
        case 't':
          e.preventDefault();
          toggleTheater();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // PiP Stub API
  const canPictureInPicture = () => document.pictureInPictureEnabled;
  const enterPictureInPicture = async () => {
    const videoElement = containerRef.current?.querySelector('video');
    if (videoElement && canPictureInPicture()) {
      try {
        await videoElement.requestPictureInPicture();
      } catch (e) {
        console.error("PiP failed", e);
      }
    }
  };
  const exitPictureInPicture = async () => {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    }
  };

  // --- External VLC Logic ---
  useEffect(() => {
    if (activeChannel && playerPreference === "vlc" && window.electronVLC) {
      window.electronVLC.load({
        url: activeUrl,
        title: `LIVE: ${activeChannel.name}`,
        options: [
          '--network-caching=1000',
          '--file-caching=1000',
          '--live-caching=1000',
        ]
      }).catch(err => {
        handleError();
      });
    }
    return () => {
      if (window.electronVLC && playerPreference === "vlc") {
        window.electronVLC.stop().catch(console.error);
      }
    };
  }, [activeUrl, activeChannel, playerPreference, handleError]);

  if (!activeChannel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-sm bg-black w-full h-full relative z-0">
        <span className="text-xl opacity-20 text-white mb-2 tracking-widest font-bold">MATRIX IPTV</span>
      </div>
    );
  }

  if (playerPreference === "vlc") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black text-gray-400 w-full h-full">
        <div className="text-lg mb-2">📺 Playing in VLC</div>
        <div className="text-sm mb-2">{activeChannel.name}</div>
        {!vlcAvailable && <div className="text-yellow-500 mt-4 text-xs">VLC not detected.</div>}
      </div>
    );
  }

  // --- ReactPlayer Implementation ---
  return (
    <div 
      ref={containerRef}
      className={`relative bg-black z-0 transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-[9999]' : 'w-full h-full'
      } ${
        currentMode === 'theater' && !isFullscreen ? 'col-span-2' : ''
      }`}
      onDoubleClick={toggleFullscreen}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => setPlaybackState(playbackState)} // Trigger a re-eval of hide timer
    >
      {/* UI Overlays */}
      <PlayerOverlay />
      <PlayerStatus />
      <PlayerControls />

      {/* Video Engine */}
      <div className="w-full h-full pointer-events-none">
        {activeUrl ? (
          <ReactPlayer
            ref={playerRef}
            url={activeUrl}
            width="100%"
            height="100%"
            playing={playbackState === 'playing' || playbackState === 'buffering'}
            volume={volume}
            muted={muted}
            onReady={() => setPlaybackState('playing')}
            onPlay={() => setPlaybackState('playing')}
            onPause={() => setPlaybackState('paused')}
            onBuffer={() => setPlaybackState('buffering')}
            onBufferEnd={() => setPlaybackState('playing')}
            onError={handleError}
            config={{
              file: {
                forceVideo: true,
                attributes: {
                  crossOrigin: "anonymous"
                }
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
