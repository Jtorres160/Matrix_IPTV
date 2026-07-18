import React, { useEffect, useRef } from 'react';
import mpegts from 'mpegts.js';
import { usePlayerStore } from '../../player/playerStore.js';

// Plays a raw MPEG-TS recording via mpegts.js attached to a <video> element.
// Wired to the shared player store so the Phase-3 controls/overlay drive it.
export default function MpegtsPlayer() {
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  const activeUrl = usePlayerStore((s) => s.activeUrl);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const seekRequest = usePlayerStore((s) => s.seekRequest);

  const setPlaybackState = usePlayerStore((s) => s.setPlaybackState);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const clearSeekRequest = usePlayerStore((s) => s.clearSeekRequest);
  const handleError = usePlayerStore((s) => s.handleError);
  const setMediaHandles = usePlayerStore((s) => s.setMediaHandles);

  // (Re)create the mpegts player whenever the source URL changes.
  useEffect(() => {
    if (!activeUrl || !videoRef.current) return;
    if (!mpegts.isSupported()) { handleError(); return; }

    const player = mpegts.createPlayer(
      { type: 'mpegts', isLive: false, url: activeUrl },
      { enableWorker: true, lazyLoad: false }
    );
    playerRef.current = player;
    player.attachMediaElement(videoRef.current);
    player.load();
    player.on(mpegts.Events.ERROR, () => handleError());

    setMediaHandles({
      getInternalPlayer: () => player,
      getVideo: () => videoRef.current,
    });

    return () => {
      try { player.destroy(); } catch (e) { /* ignore */ }
      playerRef.current = null;
    };
  }, [activeUrl, handleError, setMediaHandles]);

  // Publish duration / currentTime and playback transitions from the element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onDuration = () => setDuration(v.duration || 0);
    const onTime = () => setCurrentTime(v.currentTime || 0);
    const onPlay = () => setPlaybackState('playing');
    const onPause = () => setPlaybackState('paused');
    const onWaiting = () => setPlaybackState('buffering');
    const onEnded = () => setPlaybackState('paused');
    v.addEventListener('durationchange', onDuration);
    v.addEventListener('loadedmetadata', onDuration);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('durationchange', onDuration);
      v.removeEventListener('loadedmetadata', onDuration);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('ended', onEnded);
    };
  }, [setDuration, setCurrentTime, setPlaybackState]);

  // Drive play/pause from store state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playbackState === 'playing' || playbackState === 'buffering') {
      v.play().catch(() => {});
    } else if (playbackState === 'paused') {
      v.pause();
    }
  }, [playbackState]);

  // Volume / mute.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  // One-shot seek.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || seekRequest == null) return;
    try { v.currentTime = seekRequest; } catch (e) { /* ignore */ }
    clearSeekRequest();
  }, [seekRequest, clearSeekRequest]);

  return <video ref={videoRef} className="w-full h-full" playsInline />;
}
