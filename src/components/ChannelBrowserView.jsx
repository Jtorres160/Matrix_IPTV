import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore.js';
import { useActiveProfile, useProfilesStore, useActiveSettings } from '../store/profileStore';
import { usePlayerStore } from '../player/playerStore.js';
import { getNowNext, formatTime, programProgress } from '../lib/epg/epgTime.js';
import { isEditableElement } from '../lib/tv/isEditableElement.js';
import {
  LucideSearch, LucideTv, LucideHeart, LucideImageOff, LucideMaximize2,
  LucideEye, LucideEyeOff, LucideChevronDown, LucideChevronRight
} from 'lucide-react';

const ROW_HEIGHT = 64;

// Remote-first navigation panes. Arrow keys move focus between and within
// these; OK previews / plays; hardware Back (handled at App level) exits.
const PANE = { CATEGORIES: 'categories', CHANNELS: 'channels', DETAIL: 'detail' };

/**
 * IPTV-Smarters-style Live TV browser, built for a D-pad remote first
 * (Firestick / onn / Google TV) and mouse second:
 *   categories (with counts) | channel list (logo + now playing) | preview + EPG
 *
 * Remote model:
 *   ← → move between the three panes, ↑ ↓ move within a pane.
 *   OK on a category selects it and jumps to the channel list.
 *   OK on a channel previews it in the dock; OK again (already previewing)
 *   goes fullscreen. OK on "Watch Fullscreen" goes fullscreen.
 *   Back (Escape/Backspace) is owned by the App handler and exits to Live TV.
 *
 * Focus is state-driven (not DOM focus) so it stays correct across the
 * virtualized channel list, where a natively-focused row can unmount.
 */
export default function ChannelBrowserView() {
  const channels = useAppStore((s) => s.channels);
  const epgData = useAppStore((s) => s.epgData);
  const setSelectedChannel = useAppStore((s) => s.setSelectedChannel);
  const setPlayerDock = useAppStore((s) => s.setPlayerDock);
  const setIsImmersivePlayer = useAppStore((s) => s.setIsImmersivePlayer);
  // When the immersive/full player is up, its own key handler owns the remote.
  const isImmersivePlayer = useAppStore((s) => s.isImmersivePlayer);

  const activeProfile = useActiveProfile();
  const activeSettings = useActiveSettings();
  const updateSettings = useProfilesStore((s) => s.updateSettings);
  const toggleFavorite = useProfilesStore((s) => s.toggleFavorite);
  const addRecentlyWatched = useProfilesStore((s) => s.addRecentlyWatched);
  const favorites = activeProfile?.favorites || [];
  const hiddenCategories = activeSettings?.hiddenCategories || [];

  const { setChannel, activeChannel, activeUrl } = usePlayerStore();

  const [selectedCategory, setSelectedCategory] = useState('__all__');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [channelQuery, setChannelQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  // Remote focus model
  const [pane, setPane] = useState(PANE.CATEGORIES);
  const [chanIndex, setChanIndex] = useState(0);

  // Dock the player as a preview while this view is mounted
  useEffect(() => {
    setPlayerDock('preview');
    return () => setPlayerDock('full');
  }, [setPlayerDock]);

  // ── Category data: name -> count ─────────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts = new Map();
    channels.forEach((c) => {
      (c.groups || []).forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
    });
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [channels]);

  const visibleCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    return categoryCounts.filter(([name]) =>
      !hiddenCategories.includes(name) && (!q || name.toLowerCase().includes(q))
    );
  }, [categoryCounts, hiddenCategories, categoryQuery]);

  const hiddenList = useMemo(
    () => categoryCounts.filter(([name]) => hiddenCategories.includes(name)),
    [categoryCounts, hiddenCategories]
  );

  // Flat, ordered category list the D-pad walks through (pinned + visible)
  const categoryItems = useMemo(() => ([
    { key: '__all__', name: 'All Channels', count: channels.length },
    { key: '__fav__', name: '★ Favorites', count: favorites.length },
    ...visibleCategories.map(([name, count]) => ({ key: name, name, count })),
  ]), [channels.length, favorites.length, visibleCategories]);

  const catIndex = Math.max(0, categoryItems.findIndex((c) => c.key === selectedCategory));

  const toggleHideCategory = (name) => {
    const next = hiddenCategories.includes(name)
      ? hiddenCategories.filter((c) => c !== name)
      : [...hiddenCategories, name];
    updateSettings({ hiddenCategories: next });
    if (selectedCategory === name) setSelectedCategory('__all__');
  };

  // ── Channel list for the middle pane ─────────────────────────────────────
  const listChannels = useMemo(() => {
    let result = channels;
    if (selectedCategory === '__fav__') {
      result = result.filter((c) => favorites.includes(c.id));
    } else if (selectedCategory !== '__all__') {
      result = result.filter((c) => (c.groups || []).includes(selectedCategory));
    }
    const q = channelQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((c) => (c.name || '').toLowerCase().includes(q));
    }
    return result;
  }, [channels, selectedCategory, favorites, channelQuery]);

  // Keep the channel cursor in range as the filtered list changes
  useEffect(() => {
    setChanIndex((i) => Math.min(Math.max(0, i), Math.max(0, listChannels.length - 1)));
  }, [listChannels.length]);

  // Channel numbers = position in the full list (matches 0-9 zapping)
  const channelNumbers = useMemo(() => {
    const m = new Map();
    channels.forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }, [channels]);

  const handlePreview = useCallback((channel) => {
    if (!channel) return;
    addRecentlyWatched(channel.id);
    setChannel(channel);
    setSelectedChannel(channel);
  }, [addRecentlyWatched, setChannel, setSelectedChannel]);

  const goFullscreen = useCallback(() => {
    if (usePlayerStore.getState().activeChannel) setIsImmersivePlayer(true);
  }, [setIsImmersivePlayer]);

  // On first mount, if something is already playing, land the cursor on it.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (activeUrl) {
      const idx = listChannels.findIndex((c) => c.url === activeUrl);
      if (idx >= 0) {
        setPane(PANE.CHANNELS);
        setChanIndex(idx);
      }
    }
  }, [activeUrl, listChannels]);

  // EPG for the selected channel (right pane)
  const selectedPrograms = epgData.get(activeChannel?.tvgId) || [];
  const { now: nowProg } = getNowNext(selectedPrograms);
  const upcoming = useMemo(() => {
    const at = Date.now();
    return selectedPrograms.filter((p) => p.stop != null && p.stop > at).slice(0, 6);
  }, [selectedPrograms]);

  // ── Remote / D-pad controller ────────────────────────────────────────────
  // Latest values held in a ref so the key handler binds once and never goes
  // stale (rebinding on every cursor move would drop fast key presses).
  const nav = useRef({});
  nav.current = {
    pane, catIndex, chanIndex, categoryItems, listChannels,
    activeUrl, setSelectedCategory, setPane, setChanIndex,
    handlePreview, goFullscreen,
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      // The full player owns the remote while immersive.
      if (useAppStore.getState().isImmersivePlayer) return;
      // Let the search boxes type; don't hijack arrows while editing.
      if (isEditableElement(document.activeElement)) return;

      const k = e.key;
      if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' &&
          k !== 'ArrowRight' && k !== 'Enter') return;

      const s = nav.current;
      e.preventDefault();
      e.stopPropagation();

      if (s.pane === PANE.CATEGORIES) {
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          const ni = Math.min(Math.max(0, s.catIndex + (k === 'ArrowDown' ? 1 : -1)), s.categoryItems.length - 1);
          const item = s.categoryItems[ni];
          if (item) s.setSelectedCategory(item.key); // live-filter as you scroll
        } else if (k === 'ArrowRight' || k === 'Enter') {
          if (s.listChannels.length > 0) { s.setChanIndex(0); s.setPane(PANE.CHANNELS); }
        }
        return;
      }

      if (s.pane === PANE.CHANNELS) {
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          s.setChanIndex((i) => Math.min(Math.max(0, i + (k === 'ArrowDown' ? 1 : -1)), s.listChannels.length - 1));
        } else if (k === 'ArrowLeft') {
          s.setPane(PANE.CATEGORIES);
        } else if (k === 'ArrowRight') {
          if (usePlayerStore.getState().activeChannel) s.setPane(PANE.DETAIL);
        } else if (k === 'Enter') {
          const c = s.listChannels[s.chanIndex];
          if (!c) return;
          if (s.activeUrl === c.url) s.goFullscreen(); // already previewing -> full
          else s.handlePreview(c);
        }
        return;
      }

      if (s.pane === PANE.DETAIL) {
        if (k === 'ArrowLeft') s.setPane(PANE.CHANNELS);
        else if (k === 'Enter') s.goFullscreen();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return (
    <div className="flex h-full w-full bg-[#0B0B0D] text-[#A1A1AA]">

      {/* ── LEFT: categories ── */}
      <div className="w-72 shrink-0 border-r border-white/10 flex flex-col bg-[#111114]">
        <div className="px-4 pt-5 pb-3">
          <h1 className="text-lg font-semibold text-[#F5F5F7] tracking-tight mb-3">Channels</h1>
          <div className="relative">
            <LucideSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B73]" />
            <input
              type="text"
              placeholder="Search in categories"
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
              className="w-full bg-black/40 border border-[var(--hairline)] rounded-lg py-2 pl-8 pr-3 text-sm text-white placeholder-[#6B6B73] focus:outline-none focus:ring-2 focus:ring-[#E8B15A]/70 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar py-1">
          {categoryItems.map((item, i) => (
            <CategoryRow
              key={item.key}
              name={item.name}
              count={item.count}
              active={selectedCategory === item.key}
              focused={pane === PANE.CATEGORIES && i === catIndex}
              onClick={() => { setSelectedCategory(item.key); setChanIndex(0); setPane(PANE.CHANNELS); }}
              onToggleHide={item.key.startsWith('__') ? null : () => toggleHideCategory(item.key)}
              hidden={false}
            />
          ))}

          {hiddenList.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowHidden(!showHidden)}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-500 uppercase tracking-wider hover:text-gray-300"
              >
                {showHidden ? <LucideChevronDown size={12} /> : <LucideChevronRight size={12} />}
                Hidden ({hiddenList.length})
              </button>
              {showHidden && hiddenList.map(([name, count]) => (
                <CategoryRow
                  key={name}
                  name={name}
                  count={count}
                  active={false}
                  focused={false}
                  onClick={() => {}}
                  onToggleHide={() => toggleHideCategory(name)}
                  hidden={true}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MIDDLE: channels ── */}
      <div className="flex-1 min-w-0 border-r border-white/10 flex flex-col">
        <div className="p-3 border-b border-white/10 flex items-center gap-3">
          <div className="relative flex-1">
            <LucideSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder={`Search ${selectedCategory === '__all__' ? 'all channels' : selectedCategory === '__fav__' ? 'favorites' : selectedCategory}`}
              value={channelQuery}
              onChange={(e) => setChannelQuery(e.target.value)}
              className="w-full bg-black/40 border border-[var(--hairline)] rounded-lg py-2 pl-8 pr-3 text-sm text-white placeholder-[#6B6B73] focus:outline-none focus:ring-2 focus:ring-[#E8B15A]/70 transition-all"
            />
          </div>
          <span className="text-xs text-[#6B6B73] shrink-0 tabular-nums">{listChannels.length} channels</span>
        </div>

        <ChannelList
          channels={listChannels}
          activeUrl={activeUrl}
          epgData={epgData}
          favorites={favorites}
          channelNumbers={channelNumbers}
          focusIndex={pane === PANE.CHANNELS ? chanIndex : -1}
          onPreview={(c, i) => { setChanIndex(i); setPane(PANE.CHANNELS); handlePreview(c); }}
          onFullscreen={goFullscreen}
          onToggleFavorite={toggleFavorite}
        />
      </div>

      {/* ── RIGHT: preview + EPG ── */}
      <div className="w-[26rem] shrink-0 flex flex-col overflow-y-auto no-scrollbar">
        {/* Placeholder the docked global player floats above (same rect) */}
        <div className="p-4 pb-2">
          <div className="w-full aspect-video rounded-xl bg-black border border-[var(--hairline)] flex items-center justify-center">
            {!activeChannel && (
              <div className="text-[#6B6B73] text-sm flex flex-col items-center gap-2">
                <LucideTv size={32} />
                Select a channel to preview
              </div>
            )}
          </div>
          {activeChannel && (
            <button
              onClick={goFullscreen}
              className={`u-focus mt-3 w-full flex items-center justify-center gap-2 py-2.5 u-pill-active rounded-lg font-semibold text-sm ${
                pane === PANE.DETAIL ? 'ring-2 ring-[#F0C27B] ring-offset-2 ring-offset-[#0B0B0D]' : ''
              }`}
            >
              <LucideMaximize2 size={16} />
              Watch Fullscreen
            </button>
          )}
        </div>

        {activeChannel && (
          <div className="px-4 pb-6">
            <h2 className="text-xl font-bold text-white truncate">{activeChannel.name}</h2>
            {nowProg && (
              <div className="mt-1 mb-3">
                <div className="text-sm text-[#E8B15A] font-semibold">
                  {formatTime(nowProg.start)} – {formatTime(nowProg.stop)} · {nowProg.title}
                </div>
                {programProgress(nowProg) != null && (
                  <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-[#E8B15A] rounded-full" style={{ width: `${Math.round(programProgress(nowProg) * 100)}%` }} />
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 space-y-4">
              {upcoming.length > 0 ? upcoming.map((p, idx) => (
                <div key={idx}>
                  <div className="text-sm font-semibold text-white">
                    <span className="text-[#E8B15A] mr-2">{formatTime(p.start)} - {formatTime(p.stop)}</span>
                    {p.title}
                  </div>
                  {p.desc && p.desc !== 'No description' && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.desc}</p>
                  )}
                </div>
              )) : (
                <p className="text-sm text-gray-500 italic">No guide data for this channel.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ name, count, active, focused, onClick, onToggleHide, hidden }) {
  return (
    <div
      onClick={onClick}
      data-focused={focused || undefined}
      className={`group flex items-center justify-between pl-4 pr-4 py-2.5 cursor-pointer transition-colors border-l-2 ${
        active ? 'bg-[#E8B15A]/[0.12] text-white border-[#E8B15A]' : hidden ? 'text-[#6B6B73] hover:bg-white/5 border-transparent' : 'text-[#A1A1AA] hover:bg-white/5 hover:text-[#F5F5F7] border-transparent'
      } ${focused ? 'ring-2 ring-inset ring-[#E8B15A]/80' : ''}`}
    >
      <span className="text-sm font-medium truncate pr-2">{name}</span>
      <span className="flex items-center gap-2 shrink-0">
        {onToggleHide && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleHide(); }}
            title={hidden ? 'Show category' : 'Hide category'}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-[#A1A1AA] transition-opacity"
          >
            {hidden ? <LucideEye size={13} /> : <LucideEyeOff size={13} />}
          </button>
        )}
        <span className={`text-xs tabular-nums ${active ? 'text-[#F0C27B]' : 'text-[#6B6B73]'}`}>{count}</span>
      </span>
    </div>
  );
}

/** Self-scrolling windowed channel list with remote-driven focus. */
function ChannelList({ channels, activeUrl, epgData, favorites, channelNumbers, focusIndex, onPreview, onFullscreen, onToggleFavorite }) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewH(el.clientHeight);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Keep the remote-focused row scrolled into view (and thus rendered).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || focusIndex < 0) return;
    const top = focusIndex * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [focusIndex]);

  const total = channels.length * ROW_HEIGHT;
  const rawStart = Math.floor(scrollTop / ROW_HEIGHT) - 5;
  const rawEnd = Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + 5;
  // Force the focused row to stay within the rendered window even if the
  // scroll-state update lags a frame behind a fast key press.
  const start = Math.max(0, focusIndex >= 0 ? Math.min(rawStart, focusIndex - 5) : rawStart);
  const end = Math.min(channels.length - 1, focusIndex >= 0 ? Math.max(rawEnd, focusIndex + 5) : rawEnd);

  const rows = [];
  for (let i = start; i <= end; i++) {
    const c = channels[i];
    if (!c) continue;
    const isPlaying = activeUrl === c.url;
    const isFocused = i === focusIndex;
    const { now } = getNowNext(epgData.get(c.tvgId) || []);
    const progress = programProgress(now);
    const isFav = favorites.includes(c.id);

    rows.push(
      <div
        key={c.id || i}
        style={{ position: 'absolute', top: i * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
        onClick={() => onPreview(c, i)}
        onDoubleClick={() => { onPreview(c, i); onFullscreen(); }}
        className={`flex items-center px-3 gap-3 cursor-pointer border-b border-white/5 transition-colors ${
          isPlaying ? 'bg-[#E8B15A]/[0.10] border-l-2 border-l-[#E8B15A]' : 'hover:bg-white/5 border-l-2 border-l-transparent'
        } ${isFocused ? 'ring-2 ring-inset ring-[#E8B15A]/80 bg-white/5' : ''}`}
      >
        <span className="w-10 shrink-0 text-right text-xs font-mono text-[#6B6B73] tabular-nums">{channelNumbers.get(c.id) || ''}</span>
        <div className="w-10 h-10 shrink-0 rounded bg-black/50 flex items-center justify-center p-1">
          {c.logo
            ? <img src={c.logo} className="w-full h-full object-contain" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
            : <LucideImageOff size={16} className="text-gray-700" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold truncate ${isPlaying ? 'text-[#F0C27B]' : 'text-[#F5F5F7]'}`}>{c.name}</div>
          <div className="text-xs text-[#A1A1AA] truncate">
            {now ? now.title : (c.groups?.[0] || '')}
          </div>
          {progress != null && (
            <div className="w-32 h-0.5 bg-white/10 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-[#E8B15A] rounded-full" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(c.id); }}
          title="Toggle Favorite"
          className="p-1.5 rounded-full hover:bg-white/10 shrink-0"
        >
          <LucideHeart size={15} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-600'} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.target.scrollTop)}
      className="flex-1 overflow-y-auto relative"
    >
      <div style={{ height: total, position: 'relative' }}>{rows}</div>
      {channels.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500 text-sm">
          <LucideSearch size={22} className="mb-2 opacity-50" />
          No channels found.
        </div>
      )}
    </div>
  );
}
