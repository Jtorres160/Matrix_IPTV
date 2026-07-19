import React, { useEffect, useRef, useState } from 'react';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';
import { useProfilesStore } from '../store/profileStore';
import { getMeta, isImdbId, posterUrlFor } from '../lib/media/metaService.js';

export default function VODDetailOverlay({ item, type, onClose, onPlay }) {
  const [metadata, setMetadata] = useState(null);
  const activeSettings = useProfilesStore(s => s.getActiveSettings());
  const tmdbApiKey = activeSettings?.tmdbApiKey;
  const imdbId = item?.tvg_id || item?.tvgId || null;

  // Keyless enrichment: providers that use IMDb ids as tvg-id get posters,
  // plot, genres and rating from Cinemeta (cached in IndexedDB).
  useEffect(() => {
    let alive = true;
    if (!isImdbId(imdbId)) return undefined;
    getMeta(imdbId, type === 'vod' ? 'movie' : 'series').then((m) => {
      if (!alive || !m) return;
      setMetadata((prev) => prev || {
        overview: m.description,
        backdrop: m.background,
        poster: m.poster,
        rating: m.imdbRating,
        year: m.year,
        genres: m.genres,
        cast: m.cast,
        runtime: m.runtime,
      });
    });
    return () => { alive = false; };
  }, [imdbId, type]);

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Setup D-pad navigation for this overlay
  useKeyboardNavigation({
    initialZone: 'vod-detail',
    zonesConfig: {
      'vod-detail': { type: 'grid' }
    },
    onEnter: () => {
      const activeEl = document.querySelector('.active-focused');
      if (activeEl) activeEl.click();
    },
    onBack: () => {
      onClose();
    }
  });

  // Fetch TMDB Metadata if API key exists
  useEffect(() => {
    if (!tmdbApiKey || !item?.name) return;

    const fetchTMDB = async () => {
      try {
        const query = encodeURIComponent(item.name);
        const searchType = type === 'vod' ? 'movie' : 'tv';
        const res = await fetch(`https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbApiKey}&query=${query}`);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
          const match = data.results[0];
          setMetadata({
            overview: match.overview,
            backdrop: match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : null,
            rating: match.vote_average,
            year: (match.release_date || match.first_air_date || '').substring(0, 4)
          });
        }
      } catch (err) {
        console.error("TMDB Fetch Error:", err);
      }
    };
    fetchTMDB();
  }, [item.name, type, tmdbApiKey]);

  const handlePlayClick = async () => {
    // M3U-sourced MediaItems carry their own stream URL — play directly.
    const directUrl = item.streamUrl || item.url || item.stream_url;
    if (directUrl) {
      onPlay(directUrl);
      return;
    }

    if (type === 'vod' && window.electronDB) {
      // Xtream DB rows: build the stream URL from the playlist credentials.
      const playlistId = useProfilesStore.getState().activePlaylistId;
      const playlist = await window.electronDB.getPlaylists(useProfilesStore.getState().getActiveProfile().id)
        .then(res => res.find(p => p.id === playlistId))
        .catch(() => null);

      if (playlist && playlist.server_url) {
        const base = playlist.server_url.replace(/\/+$/, '');
        const ext = item.container_extension || 'mp4';
        const streamUrl = `${base}/movie/${playlist.username}/${playlist.password}/${item.stream_id}.${ext}`;
        onPlay(streamUrl);
      }
    } else {
      // Series playback logic requires fetching series info, omitted for MVP simplicity
      // Usually requires calling action=get_series_info&series_id=ID to get episodes.
      alert('Series playback coming soon!');
    }
  };

  const posterUrl = (type === 'vod' ? item.stream_icon : item.cover) || item.poster || item.logo
    || metadata?.poster || posterUrlFor(imdbId, 'medium');
  const description = metadata?.overview || item.plot || 'No description available.';
  const rating = metadata?.rating || item.rating || 0;
  const backdrop = metadata?.backdrop || posterUrl; // Fallback to poster

  return (
    <div style={styles.overlay} data-nav-zone="vod-detail-overlay">
      <style>{`
        .action-btn {
          transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1), background-color 0.2s, color 0.2s;
        }
        .action-btn.active-focused {
          background-color: #E8B15A !important;
          color: #141310 !important;
          transform: scale(1.05);
          box-shadow: 0 0 24px rgba(232, 177, 90, 0.45);
        }
      `}</style>
      
      <div style={{
        ...styles.backdrop,
        backgroundImage: `url(${backdrop})`,
      }}>
        <div style={styles.backdropGradient} />
      </div>

      <div style={styles.content}>
        <div style={styles.posterContainer}>
          <div style={styles.posterFallback}>
            <span style={{ fontWeight: 600, color: '#F5F5F7', fontSize: '1.1rem' }}>{item.name}</span>
          </div>
          {posterUrl && (
            <img
              src={posterUrl}
              alt={item.name}
              style={styles.poster}
              onError={(e) => { e.target.style.visibility = 'hidden'; }}
            />
          )}
        </div>

        <div style={styles.details}>
          <h1 style={styles.title}>{item.name}</h1>
          <div style={styles.metaRow}>
            {metadata?.year && <span style={styles.metaBadge}>{metadata.year}</span>}
            {rating > 0 && <span style={{...styles.metaBadge, color: '#E8B15A', borderColor: 'rgba(232,177,90,0.35)'}}>★ {Number(rating).toFixed(1)}</span>}
            {metadata?.runtime && <span style={styles.metaBadge}>{metadata.runtime}</span>}
            {(metadata?.genres || []).slice(0, 3).map((g) => (
              <span key={g} style={{...styles.metaBadge, fontWeight: 500, color: '#D9D9DE'}}>{g}</span>
            ))}
            {item.added && <span style={styles.metaBadge}>Added: {new Date(item.added * 1000).toLocaleDateString()}</span>}
          </div>
          <p style={styles.description}>{description}</p>
          {metadata?.cast?.length > 0 && (
            <p style={{ color: '#8E8E96', fontSize: '1.05rem', margin: '-24px 0 36px 0' }}>
              <span style={{ color: '#6B6B73' }}>Starring&nbsp;&nbsp;</span>{metadata.cast.join(' · ')}
            </p>
          )}

          <div style={styles.actions} data-nav-zone="vod-detail">
            <button 
              className="action-btn nav-item" 
              data-nav-row={0} data-nav-col={0}
              onClick={handlePlayClick}
              style={{...styles.btn, backgroundColor: '#fff', color: '#000'}}
            >
              ▶ Play
            </button>
            <button 
              className="action-btn nav-item" 
              data-nav-row={0} data-nav-col={1}
              onClick={onClose}
              style={{...styles.btn, backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff'}}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0B0B0D',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundSize: 'cover',
    backgroundPosition: 'top',
    opacity: 0.3,
    filter: 'blur(20px)',
  },
  backdropGradient: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    background: 'linear-gradient(to top, #0B0B0D 0%, rgba(11,11,13,0.2) 100%)',
  },
  content: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    gap: '60px',
    padding: '60px',
    maxWidth: '1200px',
    width: '100%',
    alignItems: 'center'
  },
  posterContainer: {
    position: 'relative',
    flexShrink: 0,
    width: '300px',
    height: '450px',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 30px 70px -20px rgba(0,0,0,0.9)',
    border: '1px solid rgba(232,177,90,0.25)'
  },
  posterFallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '24px',
    background: 'radial-gradient(120% 80% at 50% 0%, rgba(232,177,90,0.12), transparent 60%), linear-gradient(155deg, #23222B 0%, #16151B 55%, #0E0D12 100%)',
  },
  poster: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  details: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  title: {
    color: '#fff',
    fontSize: '3.5rem',
    fontWeight: 800,
    margin: '0 0 20px 0',
    lineHeight: 1.1,
    textShadow: '0 4px 20px rgba(0,0,0,0.5)'
  },
  metaRow: {
    display: 'flex',
    gap: '15px',
    marginBottom: '30px'
  },
  metaBadge: {
    padding: '6px 12px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '8px',
    color: '#F5F5F7',
    fontSize: '1.05rem',
    fontWeight: 600
  },
  description: {
    color: '#ccc',
    fontSize: '1.4rem',
    lineHeight: 1.5,
    marginBottom: '40px',
    maxWidth: '800px',
    display: '-webkit-box',
    WebkitLineClamp: 4,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
  },
  actions: {
    display: 'flex',
    gap: '20px'
  },
  btn: {
    padding: '15px 40px',
    borderRadius: '8px',
    fontSize: '1.3rem',
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};
