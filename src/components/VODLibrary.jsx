import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useProfilesStore } from '../store/profileStore';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';
import VODDetailOverlay from './VODDetailOverlay';
import SeriesDetailOverlay from './SeriesDetailOverlay';
import ResumeRail from './tv/ResumeRail.jsx';
import { useAppStore } from '../store/appStore.js';
import { playMediaItem } from '../lib/media/mediaResolver.js';
import { groupSeries } from '../lib/media/seriesGrouping.js';
import { buildShowsFromDbEpisodes } from '../lib/media/dbSeriesAdapter.js';

const ROW_HEIGHT = 280;
const POSTER_WIDTH = 160;
const POSTER_HEIGHT = 240;

export default function VODLibrary({ type = 'vod', onPlayStream }) {
  // ViewRouter passes 'movies' / 'series'; older callers pass 'vod'.
  const isMovies = type === 'vod' || type === 'movies';
  const activePlaylistId = useProfilesStore((s) => s.activePlaylistId);
  
  const [categories, setCategories] = useState([]);
  const [categoryData, setCategoryData] = useState({});
  // Series-only: per-category DB payload { rows: series[], episodes: series_episodes[] }.
  const [seriesDbData, setSeriesDbData] = useState({});
  const [selectedVOD, setSelectedVOD] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  
  // Custom Virtualization state
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const media = useAppStore((s) => s.media);

  useEffect(() => {
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
              const episodes = (await window.electronDB.getSeriesEpisodesByCategory(activePlaylistId, cat, 5000, 0)) || [];
              dbSeriesEntries[cat] = { rows: items, episodes };
            }
          } catch (e) {
            console.warn('[VODLibrary] DB item fetch failed (non-fatal):', e);
          }
        }
        if (storeGroups[cat]) {
          // DB rows win; drop store items whose stream URL the DB already has.
          const dbUrls = new Set(items.map((i) => i.stream_url).filter(Boolean));
          items = [...items, ...storeGroups[cat].filter((it) => {
            const u = it.streamUrl || it.url || it.stream_url;
            return !u || !dbUrls.has(u);
          })];
        }
        return [cat, items];
      }));
      setSeriesDbData(dbSeriesEntries);
      setCategoryData(Object.fromEntries(entries));
    };
    loadCategories();
  }, [activePlaylistId, isMovies, media]);

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

    let items = [];
    if (activePlaylistId && window.electronDB) {
      try {
        items = (isMovies
          ? await window.electronDB.getVODsByCategory(activePlaylistId, category, 50, 0)
          : await window.electronDB.getSeriesByCategory(activePlaylistId, category, 50, 0)) || [];
        if (!isMovies && typeof window.electronDB.getSeriesEpisodesByCategory === 'function') {
          const episodes = (await window.electronDB.getSeriesEpisodesByCategory(activePlaylistId, category, 5000, 0)) || [];
          setSeriesDbData((prev) => ({ ...prev, [category]: { rows: items, episodes } }));
        }
      } catch (e) {
        // Might not exist in DB
      }
    }

    const storeItems = isMovies ? media.movies : media.series;
    const dbUrls = new Set(items.map((i) => i.stream_url).filter(Boolean));
    const storeMatches = storeItems.filter((item) => {
      if ((item.group || 'Uncategorized') !== category) return false;
      const u = item.streamUrl || item.url || item.stream_url;
      return !u || !dbUrls.has(u);
    });
    if (storeMatches.length > 0) {
      items = [...items, ...storeMatches];
    }

    setCategoryData(prev => ({ ...prev, [category]: items }));
  }, [activePlaylistId, isMovies, categoryData, media]);

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
            // DB vod_streams rows carry stream_url (no url/type) — the store
            // MediaItems they replaced carried both. Normalize here so the
            // player always receives a playable MediaItem-shaped object.
            const url = resolvedUrl || item.streamUrl || item.url || item.stream_url;
            playMediaItem({ ...item, ...(url ? { url } : {}), type: item.type || 'movie' });
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
          
          .vod-card {
            transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1), box-shadow 0.2s, border-color 0.2s;
            will-change: transform;
          }
          .vod-card.active-focused {
            transform: scale(1.08);
            border: 2px solid #00e5ff !important;
            box-shadow: 0 0 25px rgba(0, 229, 255, 0.4);
            z-index: 10;
          }
        `}</style>

        <div style={{ padding: '40px 0 20px 40px' }}>
          <h1 style={{ color: '#fff', fontSize: '2.5rem', margin: 0, fontWeight: 700 }}>
            {isMovies ? 'Movies' : 'TV Series'}
          </h1>
        </div>

        {categories.length === 0 && (
          <div style={{ padding: '20px 40px', color: '#9aa0a6', maxWidth: '640px' }}>
            <p style={{ fontSize: '1.2rem', margin: 0 }}>
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
              <div key={name} style={{ gridRow: actualIndex + 1, gridColumn: 1, padding: '0 0 0 40px' }}>
                <h2 style={{ color: '#e0e0e0', fontSize: '1.4rem', margin: '0 0 15px 0', fontWeight: 600 }}>
                  {name}
                </h2>

                <div style={{ display: 'flex', gap: '20px', overflowX: 'visible' }}>
                  {cards.map((card, colIndex) => {
                    // DB rows carry stream_icon/cover; adapter MediaItems carry
                    // poster/logo; grouped shows carry .poster.
                    const posterUrl = isMovies
                      ? (card.stream_icon || card.cover || card.poster || card.logo || null)
                      : (card.poster || null);
                    const itemName = isMovies ? (card.name || card.title || 'Untitled') : card.show;
                    const subtitle = isMovies ? null
                      : `${card.seasonNumbers.length} season${card.seasonNumbers.length === 1 ? '' : 's'}`;
                    const onOpen = isMovies ? () => setSelectedVOD(card) : () => setSelectedSeries(card);
                    return (
                      <div
                        key={card.key || card.stream_id || card.series_id || card.id || colIndex}
                        className="vod-card"
                        data-nav-zone="vod-library"
                        data-nav-row={actualIndex}
                        data-nav-col={colIndex}
                        onClick={onOpen}
                        style={{
                          width: `${POSTER_WIDTH}px`,
                          height: `${POSTER_HEIGHT}px`,
                          backgroundColor: '#1a1a24',
                          borderRadius: '8px',
                          border: '2px solid transparent',
                          flexShrink: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          overflow: 'hidden',
                          position: 'relative'
                        }}
                      >
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt={itemName}
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ padding: '15px', color: '#ddd', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600 }}>{itemName}</span>
                            {subtitle && <span style={{ fontSize: '0.8rem', color: '#7fd8cf' }}>{subtitle}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <div style={{ color: '#666' }}>Loading...</div>
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
    backgroundColor: '#0a0a0f',
  },
  container: {
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    scrollBehavior: 'smooth'
  }
};
