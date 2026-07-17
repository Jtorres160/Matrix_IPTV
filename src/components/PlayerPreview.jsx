import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { usePlayerStore } from '../player/playerStore.js';
import PlayerControls from './player/PlayerControls.jsx';
import PlayerStatus from './player/PlayerStatus.jsx';
import PlayerOverlay from './player/PlayerOverlay.jsx';
import { useAppStore } from '../store/appStore.js';

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
    if (window.electronLog) window.electronLog.write('info', '[PlayerPreview] PLAYER_INIT / MOUNTED');
    console.log("[PlayerPreview] MOUNTED");
    
    if (window.electronVLC) {
      window.electronVLC.check().then(result => {
        setVlcAvailable(result.available);
      }).catch(console.error);
    }
    
    return () => {
      if (window.electronLog) window.electronLog.write('info', '[PlayerPreview] PLAYER_CLEANUP / UNMOUNTED');
      console.log("[PlayerPreview] UNMOUNTED");
    };
  }, []);

  const prevChannelRef = useRef(null);
  useEffect(() => {
    if (activeChannel) {
      if (window.electronLog) {
        window.electronLog.write('info', 'PLAYER_INIT / STREAM_CHANGE', {
          previousChannel: prevChannelRef.current?.name || null,
          newChannel: activeChannel.name,
          urlChange: activeUrl
        });
        window.electronLog.logMemory('entering player or after channel switch');
      }
      prevChannelRef.current = activeChannel;
    }
  }, [activeChannel, activeUrl]);

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

      // Only handle shortcuts while the player is the visible layer.
      // Without this, once a channel has played the handler hijacks
      // arrows/space across every menu and list in the app.
      const { currentView, isImmersivePlayer } = useAppStore.getState();
      if (currentView !== 'player' && !isImmersivePlayer) return;

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
        case 'backspace':
          // Exit-player handling lives in the App-level handler
          // (supreme_layout). Here we only sync fullscreen state.
          if (isFullscreen) {
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
            onReady={() => {
              if (window.electronLog) window.electronLog.write('info', `[PlayerPreview] Video Ready / HLS Initialized for: ${activeUrl}`);
              console.log(`[PlayerPreview] Video Ready / HLS Initialized for: ${activeUrl}`);
              setPlaybackState('playing');
              try { 
                performance.measure("channel-change", "channel-change-start"); 
                const entry = performance.getEntriesByName("channel-change").pop();
                if (entry && window.electronLog) {
                  window.electronLog.write('info', `[Performance] [channel-change] ${entry.duration.toFixed(2)}ms`);
                }
              } catch (e) {}
            }}
            onPlay={() => setPlaybackState('playing')}
            onPause={() => setPlaybackState('paused')}
            onBuffer={() => setPlaybackState('buffering')}
            onBufferEnd={() => setPlaybackState('playing')}
            onEnded={() => {
              // Series autoplay: roll to the next episode when one finishes.
              // Live streams never fire onEnded, so this only affects VOD/series.
              const advanced = usePlayerStore.getState().playNextInSeries();
              if (!advanced) setPlaybackState('paused');
            }}
            onError={(e) => {
              if (window.electronLog) window.electronLog.write('error', 'VIDEO_ERROR (ReactPlayer)', e);
              handleError();
            }}
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
