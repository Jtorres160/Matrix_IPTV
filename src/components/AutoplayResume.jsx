import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore.js';
import { usePlayerStore } from '../player/playerStore.js';

/**
 * Resumes the last watched channel on app launch when the
 * "Resume last channel" setting (Settings > Playback) is enabled.
 *
 * Renders nothing. Lives as its own component so the `channels`
 * subscription doesn't re-render the app shell.
 * The channel starts in the background player (Live TV hero) rather than
 * jumping straight into immersive mode.
 */
export default function AutoplayResume({ enabled }) {
  const channels = useAppStore((s) => s.channels);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!enabled || attemptedRef.current || channels.length === 0) return;
    attemptedRef.current = true; // one attempt per session

    if (usePlayerStore.getState().activeChannel) return;

    let lastId = null;
    try {
      lastId = localStorage.getItem('matrix_last_channel_id');
    } catch (e) { /* storage unavailable */ }
    if (!lastId) return;

    const channel = channels.find((c) => String(c.id) === lastId);
    if (channel) {
      console.log(`[Matrix_IPTV] Resuming last channel: ${channel.name}`);
      usePlayerStore.getState().setChannel(channel);
      useAppStore.getState().setSelectedChannel(channel);
    }
  }, [enabled, channels]);

  return null;
}
