import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore.js';
import { playMediaItem } from '../lib/media/mediaResolver.js';
import { LucideSearch, LucideTv, LucideFilm, LucideListVideo, LucideCornerDownLeft } from 'lucide-react';

const MAX_RESULTS = 18;

const TYPE_META = {
  live: { icon: LucideTv, label: 'Live', color: 'text-teal-400' },
  movie: { icon: LucideFilm, label: 'Movie', color: 'text-purple-400' },
  series: { icon: LucideListVideo, label: 'Series', color: 'text-pink-400' },
};

/**
 * Global search palette (Ctrl/Cmd+K): searches live channels, movies and
 * series from the in-memory media store. Enter plays the selection.
 */
export default function CommandPalette({ isOpen, onClose }) {
  const media = useAppStore((s) => s.media);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      // Focus after the overlay paints
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const match = (item) => (item.name || item.title || '').toLowerCase().includes(q);
    const tag = (items, type) => items.filter(match).map((item) => ({ item, type }));
    return [
      ...tag(media.live, 'live'),
      ...tag(media.movies, 'movie'),
      ...tag(media.series, 'series'),
      ...tag(media.unsorted, 'live'),
    ].slice(0, MAX_RESULTS);
  }, [query, media]);

  useEffect(() => setSelected(0), [results.length]);

  // Keep the selected row scrolled into view
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!isOpen) return null;

  const play = (entry) => {
    if (!entry) return;
    onClose();
    playMediaItem(entry.item);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      play(results[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-[640px] max-w-[90vw] bg-[#0e1c1f] border border-white/15 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <LucideSearch size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search channels, movies and series…"
            className="flex-1 bg-transparent text-white text-lg placeholder-gray-500 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-gray-400 shrink-0">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {results.map((r, i) => {
            const meta = TYPE_META[r.type] || TYPE_META.live;
            const Icon = meta.icon;
            const name = r.item.name || r.item.title;
            return (
              <div
                key={`${r.type}-${r.item.id}-${i}`}
                onClick={() => play(r)}
                onMouseEnter={() => setSelected(i)}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer ${
                  i === selected ? 'bg-teal-700/40' : ''
                }`}
              >
                <div className="w-9 h-9 rounded bg-black/50 flex items-center justify-center shrink-0 p-1">
                  {r.item.logo || r.item.poster
                    ? <img src={r.item.logo || r.item.poster} className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <Icon size={16} className="text-gray-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{name}</div>
                  <div className="text-xs text-gray-500 truncate">{r.item.group || r.item.groups?.[0] || ''}</div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color} shrink-0`}>{meta.label}</span>
                {i === selected && <LucideCornerDownLeft size={14} className="text-gray-500 shrink-0" />}
              </div>
            );
          })}

          {query.trim() && results.length === 0 && (
            <div className="px-5 py-10 text-center text-gray-500 text-sm">No results for “{query}”.</div>
          )}
          {!query.trim() && (
            <div className="px-5 py-8 text-center text-gray-600 text-sm">
              Type to search everything — live TV, movies and series.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
