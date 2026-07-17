import React, { useState, useEffect } from 'react';
import { LucideMaximize, LucideMinimize, LucideVolume2, LucideVolumeX, LucidePause, LucidePlay, LucideArrowLeft, LucideRatio, LucideSubtitles, LucideCircle, LucideSquare } from 'lucide-react';
import { usePlayerStore } from '../../player/playerStore.js';
import { useAppStore } from '../../store/appStore.js';
import { readTracks, setAudioTrack, setSubtitleTrack } from '../../lib/player/tracks.js';

const FIT_LABEL = { contain: 'Fit', cover: 'Fill', fill: 'Stretch' };

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export default function PlayerControls() {
  const {
    activeChannel,
    activeUrl,
    playbackState,
    isFullscreen,
    volume,
    muted,
    showControls,
    videoFit,
    mediaHandles,
    isVOD,
    duration,
    currentTime,
    seek,
    play,
    pause,
    toggleFullscreen,
    cycleVideoFit,
    setVolume,
    toggleMute,
    showControlsTemporarily
  } = usePlayerStore();
  const setCurrentView = useAppStore(s => s.setCurrentView);
  const setIsImmersivePlayer = useAppStore(s => s.setIsImmersivePlayer);

  const [tracksOpen, setTracksOpen] = useState(false);
  const [tracks, setTracks] = useState({ audio: [], subtitles: [], hasHls: false });
  const [isRecording, setIsRecording] = useState(false);

  const openTracks = () => {
    setTracks(readTracks(mediaHandles));
    setTracksOpen((o) => !o);
    showControlsTemporarily();
  };

  const canRecord = typeof window !== 'undefined' && !!window.electronRecording;

  // Reflect the backend recording state for the current channel.
  useEffect(() => {
    if (!canRecord || !activeChannel) { setIsRecording(false); return; }
    let cancelled = false;
    window.electronRecording.getStatus?.().then((list) => {
      if (cancelled) return;
      const id = String(activeChannel.id);
      setIsRecording(Array.isArray(list) && list.some((r) => String(r.streamId) === id));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeChannel, canRecord]);

  const toggleRecord = async () => {
    if (!canRecord || !activeChannel) return;
    const id = String(activeChannel.id);
    showControlsTemporarily();
    try {
      if (isRecording) {
        await window.electronRecording.stop(id);
        setIsRecording(false);
      } else {
        setIsRecording(true); // optimistic
        const res = await window.electronRecording.start(id, activeUrl, activeChannel.name);
        if (res && res.success === false) setIsRecording(false);
      }
    } catch {
      setIsRecording(false);
    }
  };

  // Single source of truth for "leave the player". Channels enter fullscreen by
  // flipping isImmersivePlayer (not currentView), so clearing only currentView
  // left the player layer stuck on top — the button appeared dead until an app
  // reload reset the flag. Mirror the App-level Escape/Back handler exactly.
  const handleBack = () => {
    if (isFullscreen) {
      toggleFullscreen();
    }
    setIsImmersivePlayer(false);
    if (useAppStore.getState().currentView === 'player') {
      setCurrentView('live-tv');
    }
  };

  if (!showControls || !activeChannel) return null;

  const isPlaying = playbackState === 'playing';

  return (
    <div 
      className="absolute inset-0 z-50 flex flex-col justify-between pointer-events-none"
      onMouseMove={showControlsTemporarily}
    >
      {/* TOP GRADIENT / HEADER */}
      <div className="w-full bg-gradient-to-b from-black/80 to-transparent p-6 flex justify-between items-start pointer-events-auto">
        <div className="flex flex-col">
          <div className="flex items-center gap-4 mb-2">
            <button 
              onClick={handleBack} 
              className="p-2 -ml-2 rounded-full hover:bg-white/20 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Back to Live TV"
            >
              <LucideArrowLeft size={24} />
            </button>
            <h2 className="text-2xl font-bold text-white drop-shadow-md">{activeChannel.name}</h2>
          </div>
          <span className="text-gray-300 text-sm font-medium drop-shadow-md ml-12">
            {activeChannel.groups?.[0] || 'Unknown Category'}
          </span>
        </div>
        {!isVOD && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-600/90 rounded text-xs font-bold tracking-widest uppercase text-white shadow-lg">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            Live
          </div>
        )}
      </div>

      {/* BOTTOM GRADIENT / CONTROLS */}
      <div className="w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 pb-8 pointer-events-auto flex flex-col gap-4">
        {/* Progress bar: real seekbar for VOD recordings, decorative for live */}
        {isVOD ? (
          <div className="w-full flex items-center gap-3">
            <span className="text-xs text-gray-300 tabular-nums w-14 text-right">{fmtTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer accent-blue-500"
              aria-label="Seek"
            />
            <span className="text-xs text-gray-400 tabular-nums w-14">{fmtTime(duration)}</span>
          </div>
        ) : (
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 w-full rounded-full"></div>
          </div>
        )}

        <div className="flex items-center justify-between">
          
          {/* Left Controls */}
          <div className="flex items-center gap-6">
            <button 
              onClick={isPlaying ? pause : play}
              className="text-white hover:text-blue-400 transition-colors focus:outline-none"
            >
              {isPlaying ? <LucidePause size={28} /> : <LucidePlay size={28} />}
            </button>

            <div className="flex items-center gap-3 group">
              <button 
                onClick={toggleMute}
                className="text-white hover:text-blue-400 transition-colors focus:outline-none"
              >
                {muted || volume === 0 ? <LucideVolumeX size={24} /> : <LucideVolume2 size={24} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>

            {canRecord && (
              <button
                onClick={toggleRecord}
                title={isRecording ? 'Stop recording' : 'Record'}
                className={`flex items-center gap-2 transition-colors focus:outline-none ${
                  isRecording ? 'text-red-500' : 'text-white hover:text-red-400'
                }`}
              >
                {isRecording
                  ? <LucideSquare size={20} className="fill-red-500" />
                  : <LucideCircle size={22} className="fill-red-500 text-red-500" />}
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {isRecording ? 'Recording' : 'Rec'}
                </span>
              </button>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-6 relative">
            {/* Audio / subtitle tracks */}
            <div className="relative">
              <button
                onClick={openTracks}
                title="Audio & subtitles"
                className="flex items-center gap-1.5 text-white hover:text-blue-400 transition-colors focus:outline-none"
              >
                <LucideSubtitles size={22} />
              </button>
              {tracksOpen && (
                <div className="absolute bottom-full right-0 mb-3 w-56 bg-black/95 border border-white/15 rounded-xl p-2 shadow-2xl">
                  <TrackSection
                    title="Audio"
                    tracks={tracks.audio}
                    empty="No alternate audio"
                    onPick={(id) => { setAudioTrack(mediaHandles, id); setTracks(readTracks(mediaHandles)); }}
                  />
                  <div className="my-2 border-t border-white/10" />
                  <TrackSection
                    title="Subtitles"
                    tracks={tracks.subtitles}
                    empty="No subtitles"
                    onPick={(id) => { setSubtitleTrack(mediaHandles, id); setTracks(readTracks(mediaHandles)); }}
                  />
                </div>
              )}
            </div>

            {/* Aspect ratio / zoom */}
            <button
              onClick={cycleVideoFit}
              title="Aspect ratio"
              className="flex items-center gap-1.5 text-white hover:text-blue-400 transition-colors focus:outline-none"
            >
              <LucideRatio size={22} />
              <span className="text-xs font-semibold uppercase tracking-wide">{FIT_LABEL[videoFit] || 'Fit'}</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-blue-400 transition-colors focus:outline-none"
            >
              {isFullscreen ? <LucideMinimize size={24} /> : <LucideMaximize size={24} />}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function TrackSection({ title, tracks, empty, onPick }) {
  const selectable = tracks.filter((t) => !(title === 'Audio' && t.id === -1));
  return (
    <div>
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">{title}</div>
      {selectable.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-gray-500 italic">{empty}</div>
      ) : (
        selectable.map((t) => (
          <button
            key={`${title}-${t.id}`}
            onClick={() => onPick(t.id)}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
              t.active ? 'bg-blue-600/30 text-blue-300' : 'text-gray-200 hover:bg-white/10'
            }`}
          >
            <span className="truncate">{t.name}</span>
            {t.active && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
          </button>
        ))
      )}
    </div>
  );
}
