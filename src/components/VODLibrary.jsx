import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useProfilesStore } from '../store/profileStore';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';
import VODDetailOverlay from './VODDetailOverlay';

const ROW_HEIGHT = 280;
const POSTER_WIDTH = 160;
const POSTER_HEIGHT = 240;

export default function VODLibrary({ type = 'vod', onPlayStream }) {
  const activePlaylistId = useProfilesStore((s) => s.activePlaylistId);
  
  const [categories, setCategories] = useState([]);
  const [categoryData, setCategoryData] = useState({});
  const [selectedVOD, setSelectedVOD] = useState(null);
  
  // Custom Virtualization state
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!activePlaylistId) return;
    const loadCategories = async () => {
      const cats = type === 'vod' 
        ? await window.electronDB.getVODCategories(activePlaylistId)
        : await window.electronDB.getSeriesCategories(activePlaylistId);
      
      setCategories(cats);
      
      // Eagerly load the first few categories
      const initialData = {};
      for (let i = 0; i < Math.min(cats.length, 5); i++) {
        const items = type === 'vod'
          ? await window.electronDB.getVODsByCategory(activePlaylistId, cats[i], 50, 0)
          : await window.electronDB.getSeriesByCategory(activePlaylistId, cats[i], 50, 0);
        initialData[cats[i]] = items;
      }
      setCategoryData(initialData);
    };
    loadCategories();
  }, [activePlaylistId, type]);

  // Load category data dynamically as user scrolls down
  const loadCategory = useCallback(async (category) => {
    if (!activePlaylistId || categoryData[category]) return;
    const items = type === 'vod'
      ? await window.electronDB.getVODsByCategory(activePlaylistId, category, 50, 0)
      : await window.electronDB.getSeriesByCategory(activePlaylistId, category, 50, 0);
    setCategoryData(prev => ({ ...prev, [category]: items }));
  }, [activePlaylistId, type, categoryData]);

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
          type={type} 
          onClose={() => setSelectedVOD(null)} 
          onPlay={(url) => {
            setSelectedVOD(null);
            onPlayStream(url);
          }}
        />
      )}
      
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
            {type === 'vod' ? 'Movies' : 'TV Series'}
          </h1>
        </div>

        <div style={{ display: 'grid', gridAutoRows: `${ROW_HEIGHT}px` }}>
          {categories.length > 0 && (
            <div style={{ gridRow: categories.length + 1, height: 0 }} />
          )}

          {visibleCategories.map(({ name, actualIndex }) => {
            const items = categoryData[name] || [];
            
            return (
              <div key={name} style={{ gridRow: actualIndex + 1, gridColumn: 1, padding: '0 0 0 40px' }}>
                <h2 style={{ color: '#e0e0e0', fontSize: '1.4rem', margin: '0 0 15px 0', fontWeight: 600 }}>
                  {name}
                </h2>
                
                <div style={{ display: 'flex', gap: '20px', overflowX: 'visible' }}>
                  {items.map((item, colIndex) => {
                    const posterUrl = type === 'vod' ? item.stream_icon : item.cover;
                    return (
                      <div
                        key={item.stream_id || item.series_id}
                        className="vod-card"
                        data-nav-zone="vod-library"
                        data-nav-row={actualIndex}
                        data-nav-col={colIndex}
                        onClick={() => setSelectedVOD(item)}
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
                            alt={item.name} 
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ padding: '15px', color: '#888', display: 'flex', alignItems: 'center', height: '100%', textAlign: 'center' }}>
                            {item.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {items.length === 0 && (
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
