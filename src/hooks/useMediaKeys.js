import { useEffect, useCallback } from 'react';
import { usePlayerStore } from '../player/playerStore.js';
import { useToast } from '../providers/ToastProvider.jsx';

export default function useMediaKeys() {
  const { play, pause, playbackState, setVolume, toggleMute, previousChannel, nextChannel } = usePlayerStore();
  const togglePlay = useCallback(() => playbackState === 'playing' ? pause() : play(), [playbackState, play, pause]);
  const { showToast } = useToast();

  useEffect(() => {
    const handleKeyDown = (e) => {
      let handled = false;

      switch (e.key) {
        case 'MediaPlayPause':
          togglePlay();
          showToast('Play/Pause', 'info', 1500);
          handled = true;
          break;
        case 'MediaTrackNext':
          nextChannel();
          showToast('Next Channel', 'info', 1500);
          handled = true;
          break;
        case 'MediaTrackPrevious':
          previousChannel();
          showToast('Previous Channel', 'info', 1500);
          handled = true;
          break;
        case 'AudioVolumeUp':
          setVolume((prev) => {
            const next = Math.min(prev + 0.1, 1);
            showToast(`Volume: ${Math.round(next * 100)}%`, 'info', 1000);
            return next;
          });
          handled = true;
          break;
        case 'AudioVolumeDown':
          setVolume((prev) => {
            const next = Math.max(prev - 0.1, 0);
            showToast(`Volume: ${Math.round(next * 100)}%`, 'info', 1000);
            return next;
          });
          handled = true;
          break;
        case 'AudioVolumeMute':
          toggleMute();
          showToast('Muted / Unmuted', 'warning', 1500);
          handled = true;
          break;
        default:
          break;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Attach to capture phase to beat the spatial navigation handler
    window.addEventListener('keydown', handleKeyDown, true);

    // Also integrate with MediaSession API if available
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => play());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('previoustrack', () => previousChannel());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextChannel());
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      }
    };
  }, [togglePlay, play, pause, setVolume, toggleMute, previousChannel, nextChannel, showToast]);
}
