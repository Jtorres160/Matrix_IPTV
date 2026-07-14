import { useEffect } from 'react';
import { useGlobalPlayer } from '../providers/GlobalPlayerProvider.jsx';
import { useToast } from '../providers/ToastProvider.jsx';

export default function useMediaKeys() {
  const { togglePlay, setVolume, toggleMute, volume } = useGlobalPlayer();
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
        case 'MediaTrackPrevious':
          // Optional: Map to channel up/down if applicable
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
      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
      }
    };
  }, [togglePlay, setVolume, toggleMute, showToast]);
}
