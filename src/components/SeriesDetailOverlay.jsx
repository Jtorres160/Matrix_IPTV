import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useActiveProfile, useProfilesStore } from '../store/profileStore';
import { playSeriesEpisode } from '../lib/media/mediaResolver.js';
import { episodeLabel } from '../lib/media/seriesGrouping.js';
import { LucidePlay, LucideCheck, LucideX, LucideChevronRight } from 'lucide-react';

/**
 * Show → Seasons → Episodes detail for a grouped series.
 * Remote-first: ← → switch between the season column and the episode list,
 * ↑ ↓ move within, OK plays. "Continue" starts the next unwatched episode and
 * arms autoplay for the rest of the show. Back/Escape closes.
 *
 * Keys are handled on the capture phase with stopImmediatePropagation so the
 * VOD grid navigation mounted behind this overlay doesn't also move.
 */
export default function SeriesDetailOverlay({ show, onClose }) {
  const activeProfile = useActiveProfile();
  const addRecentlyWatched = useProfilesStore((s) => s.addRecentlyWatched);

  // Set of episode ids the user has already watched (best-effort across the
  // profile's history shapes).
  const watchedIds = useMemo(() => {
    const set = new Set();
    const push = (v) => { if (v != null) set.add(String(v)); };
    (activeProfile?.watchHistory || []).forEach((h) => push(h?.id ?? h?.channelId ?? h));
    (activeProfile?.recentlyWatched || []).forEach((h) => push(h?.id ?? h));
    return set;
  }, [activeProfile]);

  const seasonNumbers = show.seasonNumbers || [];
  const [selectedSeason, setSelectedSeason] = useState(seasonNumbers[0] ?? 1);

  // Next unwatched episode across the whole show (for "Continue").
  const nextUp = useMemo(
    () => show.episodes.find((e) => !watchedIds.has(String(e.id))) || show.episodes[0],
    [show.episodes, watchedIds]
  );

  // Left column = [Continue, ...seasons]; right column = episodes of season.
  const leftItems = useMemo(
    () => [{ type: 'continue' }, ...seasonNumbers.map((s) => ({ type: 'season', season: s }))],
    [seasonNumbers]
  );
  const episodes = show.seasons.get(selectedSeason) || [];

  const [pane, setPane] = useState('left');
  const [leftIdx, setLeftIdx] = useState(nextUp ? 0 : 1);
  const [rightIdx, setRightIdx] = useState(0);

  const startEpisode = (ep) => {
    if (!ep) return;
    addRecentlyWatched(ep.id);
    onClose();
    playSeriesEpisode(show, ep);
  };

  // Keep refs fresh for the single bound handler.
  const ref = useRef({});
  ref.current = { pane, leftIdx, rightIdx, leftItems, episodes, selectedSeason, nextUp, seasonNumbers };

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key;
      if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' &&
          k !== 'ArrowRight' && k !== 'Enter' && k !== 'Escape' && k !== 'Backspace') return;

      // Shield the VOD grid nav mounted behind this overlay.
      e.preventDefault();
      e.stopImmediatePropagation();

      const s = ref.current;
      if (k === 'Escape' || k === 'Backspace') { onClose(); return; }

      if (s.pane === 'left') {
        if (k === 'ArrowUp') setLeftIdx((i) => Math.max(0, i - 1));
        else if (k === 'ArrowDown') setLeftIdx((i) => Math.min(s.leftItems.length - 1, i + 1));
        else if (k === 'ArrowRight') { if (s.episodes.length) setPane('right'); }
        else if (k === 'Enter') {
          const item = s.leftItems[s.leftIdx];
          if (item?.type === 'continue') startEpisode(s.nextUp);
          else if (item?.type === 'season') { setSelectedSeason(item.season); setRightIdx(0); setPane('right'); }
        }
        return;
      }

      // right (episodes) pane
      if (k === 'ArrowUp') setRightIdx((i) => Math.max(0, i - 1));
      else if (k === 'ArrowDown') setRightIdx((i) => Math.min(s.episodes.length - 1, i + 1));
      else if (k === 'ArrowLeft') setPane('left');
      else if (k === 'Enter') startEpisode(s.episodes[s.rightIdx]);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const focusRing = 'ring-2 ring-[#E8B15A]/80 ring-offset-2 ring-offset-[#0B0B0D]';

  return (
    <div className="absolute inset-0 z-[100] bg-[#0B0B0D] flex flex-col" data-series-overlay>
      {/* Backdrop */}
      {show.poster && (
        <div className="absolute inset-0 opacity-20 blur-2xl" style={{ backgroundImage: `url(${show.poster})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/80 to-[#0B0B0D]/40" />

      <div className="relative z-10 flex-1 flex flex-col p-8 min-h-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 shrink-0">
          <div className="flex gap-6">
            <div className="w-28 h-40 rounded-lg overflow-hidden bg-black/50 border border-white/10 shrink-0 flex items-center justify-center">
              {show.poster
                ? <img src={show.poster} alt={show.show} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                : <span className="text-gray-600 text-xs px-2 text-center">{show.show}</span>}
            </div>
            <div>
              <h1 className="text-4xl font-black text-white drop-shadow-lg">{show.show}</h1>
              <p className="text-gray-400 mt-2">
                {seasonNumbers.length} season{seasonNumbers.length === 1 ? '' : 's'} · {show.episodeCount} episode{show.episodeCount === 1 ? '' : 's'}
              </p>
              {nextUp && (
                <p className="text-[#E8B15A] mt-1 text-sm">Up next · {episodeLabel(nextUp)}{nextUp._epTitle ? ` · ${nextUp._epTitle}` : ''}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white" title="Close">
            <LucideX size={24} />
          </button>
        </div>

        {/* Body: seasons | episodes */}
        <div className="flex-1 flex gap-6 min-h-0">
          {/* Left: Continue + seasons */}
          <div className="w-56 shrink-0 flex flex-col gap-2 overflow-y-auto no-scrollbar">
            {leftItems.map((item, i) => {
              const focused = pane === 'left' && i === leftIdx;
              if (item.type === 'continue') {
                return (
                  <button
                    key="continue"
                    onClick={() => startEpisode(nextUp)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg font-bold text-sm u-pill-active ${focused ? focusRing : ''}`}
                  >
                    <LucidePlay size={16} /> Continue
                  </button>
                );
              }
              const active = item.season === selectedSeason;
              return (
                <button
                  key={`s${item.season}`}
                  onClick={() => { setSelectedSeason(item.season); setRightIdx(0); setPane('right'); }}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium ${
                    active ? 'bg-white/15 text-white' : 'text-gray-300 hover:bg-white/5'
                  } ${focused ? focusRing : ''}`}
                >
                  Season {item.season}
                  <LucideChevronRight size={14} className="opacity-60" />
                </button>
              );
            })}
          </div>

          {/* Right: episodes */}
          <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar space-y-2">
            {episodes.map((ep, i) => {
              const focused = pane === 'right' && i === rightIdx;
              const watched = watchedIds.has(String(ep.id));
              return (
                <button
                  key={ep.id || i}
                  onClick={() => startEpisode(ep)}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left ${
                    focused ? `bg-white/10 ${focusRing}` : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span className="w-14 shrink-0 font-mono text-xs text-[#E8B15A] tabular-nums">{episodeLabel(ep)}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-100">{ep._epTitle || ep.name}</span>
                  {watched && <LucideCheck size={16} className="text-[#E8B15A] shrink-0" title="Watched" />}
                  <LucidePlay size={16} className="text-gray-400 shrink-0" />
                </button>
              );
            })}
            {episodes.length === 0 && (
              <p className="text-gray-500 text-sm px-4 py-8">No episodes in this season.</p>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-600 mt-4 shrink-0">← → switch column · ↑ ↓ move · OK play · Back close</p>
      </div>
    </div>
  );
}
