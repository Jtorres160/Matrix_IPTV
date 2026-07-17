import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useProfilesStore } from '../store/profileStore';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';
import VODDetailOverlay from './VODDetailOverlay';
import SeriesDetailOverlay from './SeriesDetailOverlay';
import ResumeRail from './tv/ResumeRail.jsx';
import { useAppStore } from '../store/appStore.js';
import { playMediaItem } from '../lib/media/mediaResolver.js';
import { groupSeries } from '../lib/media/seriesGrouping.js';

const ROW_HEIGHT = 280;
const POSTER_WIDTH = 160;
const POSTER_HEIGHT = 240;

export default function VODLibrary({ type = 'vod', onPlayStream }) {
  // ViewRouter passes 'movies' / 'series'; older callers pass 'vod'.
  const isMovies = type === 'vod' || type === 'movies';
  const activePlaylistId = useProfilesStore((s) => s.activePlaylistId);
  
  const [categories, setCategories] = useState([]);
  const [categoryData, setCategoryData] = useState({});
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
      
      // Eagerly load the first few categories
      const initialData = {};
      for (let i = 0; i < Math.min(mergedCats.length, 5); i++) {
        const cat = mergedCats[i];
        let items = [];
        if (dbCats.includes(cat) && window.electronDB) {
          try {
            items = (isMovies
              ? await window.electronDB.getVODsByCategory(activePlaylistId, cat, 50, 0)
              : await window.electronDB.getSeriesByCategory(activePlaylistId, cat, 50, 0)) || [];
          } catch (e) {
            console.warn('[VODLibrary] DB item fetch failed (non-fatal):', e);
          }
        }
        if (storeGroups[cat]) {
          items = [...items, ...storeGroups[cat]];
        }
        initialData[cat] = items;
      }
      setCategoryData(initialData);
    };
    loadCategories();
  }, [activePlaylistId, isMovies, media]);

  // Load category data dynamically as user scrolls down
  const loadCategory = useCallback(async (category) => {
    if (categoryData[category]) return;

    let items = [];
    // DB fetch
    if (activePlaylistId && window.electronDB) {
      try {
        items = (isMovies
          ? await window.electronDB.getVODsByCategory(activePlaylistId, category, 50, 0)
          : await window.electronDB.getSeriesByCategory(activePlaylistId, category, 50, 0)) || [];
      } catch (e) {
        // Might not exist in DB
      }
    }

    // AppStore fetch
    const storeItems = isMovies ? media.movies : media.series;
    const storeMatches = storeItems.filter(item => (item.group || 'Uncategorized') === category);
    if (storeMatches.length > 0) {
      items = [...items, ...storeMatches];
    }

    setCategoryData(prev => ({ ...prev, [category]: items }));
  }, [activePlaylistId, isMovies, categoryData, media]);

  // Handle scrolling and focus
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
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
          onPlay={() => {
            const item = selectedVOD;
            setSelectedVOD(null);
            playMediaItem(item);
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
            const rawItems = categoryData[name] || [];
            // Series arrive as flat episodes; collapse them into one card per
            // show. Movies render one card per title as-is.
            const cards = isMovies ? rawItems : groupSeries(rawItems);

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
