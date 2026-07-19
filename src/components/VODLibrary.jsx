import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useProfilesStore } from '../store/profileStore';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';
import VODDetailOverlay from './VODDetailOverlay';
import SeriesDetailOverlay from './SeriesDetailOverlay';
import ResumeRail from './tv/ResumeRail.jsx';
import { useAppStore } from '../store/appStore.js';
import { playMediaItem } from '../lib/media/mediaResolver.js';
import { groupSeries } from '../lib/media/seriesGrouping.js';
import { buildShowsFromDbEpisodes, fetchAllSeriesEpisodes } from '../lib/media/dbSeriesAdapter.js';
import { toPlayableVodItem } from '../lib/media/playableItem.js';
import { posterUrlFor, getMetaMany, isImdbId } from '../lib/media/metaService.js';
import { LucideFilm, LucidePlay, LucideLayers } from 'lucide-react';

const ROW_HEIGHT = 328;
const POSTER_WIDTH = 178;
const POSTER_HEIGHT = 267;

export default function VODLibrary({ type = 'vod', onPlayStream }) {
  // ViewRouter passes 'movies' / 'series'; older callers pass 'vod'.
  const isMovies = type === 'vod' || type === 'movies';
  const activePlaylistId = useProfilesStore((s) => s.activePlaylistId);
  
  const [categories, setCategories] = useState([]);
  const [categoryData, setCategoryData] = useState({});
  // Movies grouping mode: 'provider' (categories as delivered) | 'az' | 'genre'
  const [grouping, setGrouping] = useState(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('matrix_movie_grouping')) || 'provider');
  // Genre mode: progressive index built from cached/fetched metadata.
  const [genreIndex, setGenreIndex] = useState({});       // genre -> vod rows
  const [genreProgress, setGenreProgress] = useState(null); // {done,total} | null
  // Series-only: per-category DB payload { rows: series[], episodes: series_episodes[] }.
  const [seriesDbData, setSeriesDbData] = useState({});
  const [selectedVOD, setSelectedVOD] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  
  // Custom Virtualization state
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const media = useAppStore((s) => s.media);

  const setGroupingPersist = (mode) => {
    setGrouping(mode);
    try { localStorage.setItem('matrix_movie_grouping', mode); } catch { /* noop */ }
  };

  // ── A–Z mode: letter buckets straight from SQL ─────────────────────────────
  useEffect(() => {
    if (!isMovies || grouping !== 'az') return;
    let alive = true;
    (async () => {
      if (!activePlaylistId || !window.electronDB?.getVODInitials) { setCategories([]); return; }
      const initials = (await window.electronDB.getVODInitials(activePlaylistId)) || [];
      if (!alive) return;
      const letters = initials.map((r) => r.letter);
      setCategories(letters);
      setCategoryData({});
      const first = letters.slice(0, 5);
      const entries = await Promise.all(first.map(async (letter) => [
        letter,
        (await window.electronDB.getVODsByInitial(activePlaylistId, letter, 50, 0)) || [],
      ]));
      if (alive) setCategoryData(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
  }, [activePlaylistId, isMovies, grouping]);

  // ── Genre mode: progressive index over Cinemeta metadata ───────────────────
  // Rows appear as titles get classified; everything is cached in IndexedDB so
  // the index builds instantly on later visits.
  useEffect(() => {
    if (!isMovies || grouping !== 'genre') { setGenreProgress(null); return; }
    let alive = true;
    const ac = new AbortController();
    (async () => {
      if (!activePlaylistId || !window.electronDB?.getVODInitials) return;
      const initials = (await window.electronDB.getVODInitials(activePlaylistId)) || [];
      if (!alive) return;

      // Pull every movie row (paged per letter) so the index covers the library.
      const allRows = [];
      for (const { letter } of initials) {
        for (let offset = 0; alive; offset += 500) {
          const page = (await window.electronDB.getVODsByInitial(activePlaylistId, letter, 500, offset)) || [];
          allRows.push(...page);
          if (page.length < 500) break;
        }
      }
      if (!alive) return;

      const withIds = allRows.filter((r) => isImdbId(r.tvg_id));
      const byId = new Map(withIds.map((r) => [r.tvg_id, r]));
      setGenreProgress({ done: 0, total: withIds.length });

      const index = {};
      let done = 0;
      let lastFlush = 0;
      const flush = () => {
        const cats = Object.keys(index).sort((a, b) => index[b].length - index[a].length);
        setCategories(cats);
        setCategoryData(Object.fromEntries(cats.map((g) => [g, index[g].slice(0, 50)])));
        setGenreIndex({ ...index });
      };
      await getMetaMany(withIds.map((r) => ({ id: r.tvg_id, kind: 'movie' })), {
        concurrency: 8,
        signal: ac.signal,
        onItem: (id, meta) => {
          done += 1;
          const row = byId.get(id);
          for (const g of (meta?.genres || [])) {
            (index[g] = index[g] || []).push(row);
          }
          if (alive && (done - lastFlush >= 50 || done === withIds.length)) {
            lastFlush = done;
            flush();
            setGenreProgress({ done, total: withIds.length });
          }
        },
      });
      if (alive) { flush(); setGenreProgress({ done: withIds.length, total: withIds.length }); }
    })();
    return () => { alive = false; ac.abort(); };
  }, [activePlaylistId, isMovies, grouping]);

  useEffect(() => {
    if (isMovies && grouping !== 'provider') return;
    const loadCategories = async () => {
      // 1. Fetch from DB (Xtream / dedicated DB tables) — optional, guarded:
      // electronDB is absent in pure-browser dev and may reject on old schemas.
      let dbCats = [];
      if (activePlaylistId && window.electronDB) {
        try {
          dbCats = (isMovies
            ? await window.electronDB.getVODCategories(activePlaylistId)
            : await window.electronDB.getSeriesCategories(activePlaylistId)) || [];
        } catch (e) {
          console.warn('[VODLibrary] DB category fetch failed (non-fatal):', e);
        }
      }

      // 2. Fetch from in-memory M3U categorized state
      const storeItems = isMovies ? media.movies : media.series;
      const storeGroups = {};
      storeItems.forEach(item => {
        const g = item.group || 'Uncategorized';
        if (!storeGroups[g]) storeGroups[g] = [];
        storeGroups[g].push(item);
      });

      const storeCats = Object.keys(storeGroups);

      // Merge unique categories
      const mergedCats = [...new Set([...dbCats, ...storeCats])];
      setCategories(mergedCats);

      // Eagerly load the first few categories — in parallel, not one DB
      // round-trip at a time (this was a serial await-in-a-loop that added up
      // to 5x the latency of a single category fetch).
      const initialCats = mergedCats.slice(0, 5);
      const dbSeriesEntries = {};
      const entries = await Promise.all(initialCats.map(async (cat) => {
        let items = [];
        if (dbCats.includes(cat) && window.electronDB) {
          try {
            items = (isMovies
              ? await window.electronDB.getVODsByCategory(activePlaylistId, cat, 50, 0)
              : await window.electronDB.getSeriesByCategory(activePlaylistId, cat, 50, 0)) || [];
            if (!isMovies && typeof window.electronDB.getSeriesEpisodesByCategory === 'function') {
              const episodes = await fetchAllSeriesEpisodes(window.electronDB.getSeriesEpisodesByCategory, activePlaylistId, cat);
              dbSeriesEntries[cat] = { rows: items, episodes };
            }
          } catch (e) {
            console.warn('[VODLibrary] DB item fetch failed (non-fatal):', e);
          }
        }
        if (storeGroups[cat]) {
          // Movies: DB rows win — drop store items whose stream URL the DB
          // already has. Series rows carry no stream_url, so their store
          // overlap is deduped later in groupedCategoryData (coveredKeys /
          // dbEpUrls), not here.
          const dbUrls = new Set(items.map((i) => i.stream_url).filter(Boolean));
          const storeAdds = isMovies
            ? storeGroups[cat].filter((it) => {
                const u = it.streamUrl || it.url || it.stream_url;
                return !u || !dbUrls.has(u);
              })
            : storeGroups[cat];
          items = [...items, ...storeAdds];
        }
        return [cat, items];
      }));
      setSeriesDbData(dbSeriesEntries);
      setCategoryData(Object.fromEntries(entries));
    };
    loadCategories();
  }, [activePlaylistId, isMovies, media, grouping]);

  // Series episodes are regrouped into shows only when the underlying data
  // changes, not on every render — groupSeries used to run inline in the
  // render loop, including on every raw scroll event, which is what made the
  // Series tab feel slow while scrolling/browsing.
  const groupedCategoryData = useMemo(() => {
    if (isMovies) return categoryData;
    const out = {};
    for (const [cat, items] of Object.entries(categoryData)) {
      const dbData = seriesDbData[cat];
      const dbEpisodes = (dbData && dbData.episodes) || [];

      // M3U path: structured episode rows exist → build shows from the DB.
      const dbShows = dbEpisodes.length > 0
        ? buildShowsFromDbEpisodes(dbData.rows, dbEpisodes, activePlaylistId)
        : [];

      // Fallback (Xtream show rows without episodes + in-memory store items),
      // minus anything the DB shows already cover.
      const coveredKeys = new Set(dbEpisodes.map((e) => String(e.series_key)));
      const dbEpUrls = new Set(dbEpisodes.map((e) => e.stream_url).filter(Boolean));
      const fallbackItems = items.filter((it) => {
        if (it.series_id != null && coveredKeys.has(String(it.series_id))) return false;
        const u = it.streamUrl || it.url || it.stream_url;
        return !u || !dbEpUrls.has(u);
      });

      out[cat] = [...dbShows, ...groupSeries(fallbackItems)]
        .sort((a, b) => a.show.localeCompare(b.show));
    }
    return out;
  }, [categoryData, seriesDbData, isMovies, activePlaylistId]);

  // Load category data dynamically as user scrolls down
  const loadCategory = useCallback(async (category) => {
    if (categoryData[category]) return;

    // A–Z rows come straight from SQL; genre rows are served by the index.
    if (isMovies && grouping === 'az') {
      if (activePlaylistId && window.electronDB?.getVODsByInitial) {
        const rows = (await window.electronDB.getVODsByInitial(activePlaylistId, category, 50, 0)) || [];
        setCategoryData((prev) => ({ ...prev, [category]: rows }));
      }
      return;
    }
    if (isMovies && grouping === 'genre') return;

    let items = [];
    if (activePlaylistId && window.electronDB) {
      try {
        items = (isMovies
          ? await window.electronDB.getVODsByCategory(activePlaylistId, category, 50, 0)
          : await window.electronDB.getSeriesByCategory(activePlaylistId, category, 50, 0)) || [];
        if (!isMovies && typeof window.electronDB.getSeriesEpisodesByCategory === 'function') {
          const episodes = await fetchAllSeriesEpisodes(window.electronDB.getSeriesEpisodesByCategory, activePlaylistId, category);
          setSeriesDbData((prev) => ({ ...prev, [category]: { rows: items, episodes } }));
        }
      } catch (e) {
        // Might not exist in DB
      }
    }

    // Same dedupe rule as loadCategories above: URL dedupe applies to movies
    // only; series store overlap is handled in groupedCategoryData.
    const storeItems = isMovies ? media.movies : media.series;
    const dbUrls = new Set(items.map((i) => i.stream_url).filter(Boolean));
    const storeMatches = storeItems.filter((item) => {
      if ((item.group || 'Uncategorized') !== category) return false;
      if (!isMovies) return true;
      const u = item.streamUrl || item.url || item.stream_url;
      return !u || !dbUrls.has(u);
    });
    if (storeMatches.length > 0) {
      items = [...items, ...storeMatches];
    }

    setCategoryData(prev => ({ ...prev, [category]: items }));
  }, [activePlaylistId, isMovies, categoryData, media, grouping]);

  // Handle scrolling and focus — throttled to one state update per animation
  // frame instead of one per native scroll event, which on its own was
  // forcing a full re-render (and, before the groupedCategoryData memo above,
  // a full re-group of every series category) on every scroll tick.
  const latestScrollTop = useRef(0);
  const scrollRafScheduled = useRef(false);
  const handleScroll = useCallback((e) => {
    latestScrollTop.current = e.target.scrollTop;
    if (scrollRafScheduled.current) return;
    scrollRafScheduled.current = true;
    requestAnimationFrame(() => {
      setScrollTop(latestScrollTop.current);
      scrollRafScheduled.current = false;
    });
  }, []);

  useEffect(() => {
    const handleFocusIn = (e) => {
      const navRow = e.target.getAttribute('data-nav-row');
      if (navRow !== null) {
        const idx = parseInt(navRow, 10);
        setActiveIndex(idx);
        
        // Eager load next category
        if (categories[idx + 1]) loadCategory(categories[idx + 1]);
      }
    };
    const current = containerRef.current;
    if (current) {
      current.addEventListener('focusin', handleFocusIn);
      return () => current.removeEventListener('focusin', handleFocusIn);
    }
  }, [categories, loadCategory]);

  const BUFFER = 3;
  const VISIBLE_ROWS = Math.ceil((typeof window !== 'undefined' ? window.innerHeight : 1080) / ROW_HEIGHT);
  const scrollIndex = Math.floor(scrollTop / ROW_HEIGHT);
  
  const startIndex = Math.max(0, Math.min(scrollIndex, activeIndex) - BUFFER);
  const endIndex = Math.min(categories.length, Math.max(scrollIndex, activeIndex) + VISIBLE_ROWS + BUFFER);

  const visibleCategories = useMemo(() => {
    return categories.slice(startIndex, endIndex).map((cat, i) => ({
      name: cat,
      actualIndex: startIndex + i
    }));
  }, [categories, startIndex, endIndex]);

  // Setup D-pad Navigation for this zone
  useKeyboardNavigation({
    initialZone: 'vod-library',
    zonesConfig: {
      'vod-library': { type: 'grid' }
    },
    onEnter: () => {
      const activeEl = document.querySelector('.active-focused');
      if (activeEl) activeEl.click();
    },
    onBack: () => {
      // Logic for going back to Sidebar handled globally or here
    }
  });

  return (
    <div style={styles.wrapper}>
      {selectedVOD && (
        <VODDetailOverlay
          item={selectedVOD}
          type={isMovies ? 'vod' : 'series'}
          onClose={() => setSelectedVOD(null)}
          onPlay={(resolvedUrl) => {
            const item = selectedVOD;
            setSelectedVOD(null);
            // DB vod_streams rows carry stream_url/stream_icon (no url/type/
            // logo) — normalize so the player and Now-Playing overlay always
            // receive a playable MediaItem-shaped object.
            playMediaItem(toPlayableVodItem(item, resolvedUrl));
          }}
        />
      )}

      {selectedSeries && (
        <SeriesDetailOverlay
          show={selectedSeries}
          onClose={() => setSelectedSeries(null)}
        />
      )}
      
      <ResumeRail types={isMovies ? ['movie'] : ['series']} onPlay={playMediaItem} />

      <div className="vod-container" ref={containerRef} onScroll={handleScroll} style={styles.container}>
        <style>{`
          .vod-container::-webkit-scrollbar { display: none; }
          .vod-container { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>

        <div style={{ padding: '44px 0 22px 44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{
              width: '44px', height: '44px', borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(232,177,90,0.14)', color: '#E8B15A',
              border: '1px solid rgba(232,177,90,0.22)'
            }}>
              {isMovies ? <LucideFilm size={22} /> : <LucideLayers size={22} />}
            </span>
            <h1 style={{ color: '#F5F5F7', fontSize: '2.4rem', margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {isMovies ? 'Movies' : 'TV Series'}
            </h1>

            {isMovies && (
              <div style={{ display: 'flex', gap: '6px', marginLeft: '22px', padding: '4px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {[['provider', 'Categories'], ['az', 'A–Z'], ['genre', 'Genres']].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setGroupingPersist(mode)}
                    style={{
                      padding: '8px 18px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                      fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.01em',
                      background: grouping === mode ? 'rgba(232,177,90,0.18)' : 'transparent',
                      color: grouping === mode ? '#E8B15A' : '#A1A1AA',
                      boxShadow: grouping === mode ? 'inset 0 0 0 1px rgba(232,177,90,0.35)' : 'none',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {isMovies && grouping === 'genre' && genreProgress && genreProgress.done < genreProgress.total && (
              <span style={{ marginLeft: '16px', color: '#A1A1AA', fontSize: '0.85rem' }}>
                Building genre index… {Math.round((genreProgress.done / Math.max(1, genreProgress.total)) * 100)}%
              </span>
            )}
          </div>
        </div>

        {categories.length === 0 && !(isMovies && grouping === 'genre' && genreProgress) && (
          <div style={{ padding: '20px 44px', color: '#A1A1AA', maxWidth: '640px' }}>
            <p style={{ fontSize: '1.2rem', margin: 0, color: '#F5F5F7', fontWeight: 600 }}>
              {isMovies ? 'No movies found in your sources.' : 'No series found in your sources.'}
            </p>
            <p style={{ fontSize: '0.95rem', marginTop: '10px', lineHeight: 1.5 }}>
              Content appears here when a playlist contains {isMovies ? 'video-on-demand movies' : 'TV series episodes'}.
              Live TV channels stay under the Live TV tab.
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridAutoRows: `${ROW_HEIGHT}px` }}>
          {categories.length > 0 && (
            <div style={{ gridRow: categories.length + 1, height: 0 }} />
          )}

          {visibleCategories.map(({ name, actualIndex }) => {
            // Movies render one card per title; series were already grouped
            // into shows by the groupedCategoryData memo above.
            const cards = groupedCategoryData[name] || [];

            return (
              <div key={name} style={{ gridRow: actualIndex + 1, gridColumn: 1, padding: '0 0 0 44px' }}>
                <h2 style={{ color: '#F5F5F7', fontSize: '1.35rem', margin: '0 0 16px 0', fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {name}
                </h2>

                <div style={{ display: 'flex', gap: '22px', overflowX: 'visible' }}>
                  {cards.map((card, colIndex) => {
                    // DB rows carry stream_icon/cover; adapter MediaItems carry
                    // poster/logo; grouped shows carry .poster. Providers that
                    // key entries by IMDb id get real artwork via metahub even
                    // when the playlist itself ships none.
                    const posterUrl = isMovies
                      ? (card.stream_icon || card.cover || card.poster || card.logo
                         || posterUrlFor(card.tvg_id || card.tvgId))
                      : (card.poster || posterUrlFor(card.tvgId));
                    const itemName = isMovies ? (card.name || card.title || 'Untitled') : card.show;
                    const subtitle = isMovies ? null
                      : `${card.seasonNumbers.length} season${card.seasonNumbers.length === 1 ? '' : 's'}`;
                    const onOpen = isMovies ? () => setSelectedVOD(card) : () => setSelectedSeries(card);
                    return (
                      <div
                        key={card.key || card.stream_id || card.series_id || card.id || colIndex}
                        className="vod-card poster-card"
                        data-nav-zone="vod-library"
                        data-nav-row={actualIndex}
                        data-nav-col={colIndex}
                        onClick={onOpen}
                        title={itemName}
                        style={{ width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px`, flexShrink: 0 }}
                      >
                        {/* Designed fallback ALWAYS sits behind the artwork, so a
                            missing OR broken poster degrades to this, never a
                            blank card. */}
                        <div className="poster-fallback">
                          <span className="poster-fallback-icon" style={{ color: '#E8B15A', opacity: 0.55 }}>
                            {isMovies ? <LucideFilm size={30} /> : <LucideLayers size={30} />}
                          </span>
                          <span className="poster-fallback-title">{itemName}</span>
                          {subtitle && <span className="poster-fallback-sub">{subtitle}</span>}
                        </div>

                        {posterUrl && (
                          <img
                            src={posterUrl}
                            alt={itemName}
                            loading="lazy"
                            className="poster-img"
                            onError={(e) => { e.target.style.visibility = 'hidden'; }}
                          />
                        )}

                        <div className="poster-play"><LucidePlay size={22} fill="currentColor" /></div>

                        <div className="poster-scrim">
                          <div className="poster-scrim-title">{itemName}</div>
                          {subtitle && <div style={{ color: '#E8B15A', fontSize: '0.7rem', fontWeight: 500, marginTop: '3px' }}>{subtitle}</div>}
                        </div>
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <div style={{ color: '#6B6B73', display: 'flex', alignItems: 'center', height: `${POSTER_HEIGHT}px` }}>Loading…</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#0B0B0D',
  },
  container: {
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    scrollBehavior: 'smooth'
  }
};
