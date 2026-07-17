/**
 * src/lib/media/mediaClassifier.js
 * 
 * Heuristics-based classifier to separate generic channel objects into
 * 'live', 'movie', or 'series'.
 */

const MOVIE_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'];
const MOVIE_GROUPS = ['movies', 'vod', 'cinema', 'netflix', '4k movies', 'film'];
const SERIES_GROUPS = ['series', 'tv shows', 'shows', 'season'];

/**
 * Normalizes strings for robust matching.
 */
function normalize(str) {
  if (!str) return '';
  return str.toLowerCase().trim();
}

/**
 * Classifies a raw channel row into a specific media type with a confidence score.
 * @param {Object} row 
 * @returns {{ type: "live" | "movie" | "series" | "unsorted", confidence: number }}
 */
export function classifyMedia(row) {
  // 1. Check existing DB fields or explicit types if provided
  if (row._dbTable === 'vod_streams') return { type: 'movie', confidence: 1.0 };
  if (row._dbTable === 'series') return { type: 'series', confidence: 1.0 };
  if (row.type === 'movie' || row.type === 'series' || row.type === 'live') {
    return { type: row.type, confidence: 1.0 };
  }
  
  if (row.stream_type === 'movie') return { type: 'movie', confidence: 1.0 };
  if (row.stream_type === 'series') return { type: 'series', confidence: 1.0 };

  const groupTitle = normalize(row.group_title || row.group || row.groupTitle || '');
  const url = normalize(row.stream_url || row.url || '');
  const name = normalize(row.name || row.title || '');

  // 2. Check URL pattern heuristics (Strong indicators)
  if (MOVIE_EXTENSIONS.some(ext => url.includes(ext))) {
    return { type: 'movie', confidence: 0.95 };
  }
  if (url.includes('series') || url.match(/s\d{2}e\d{2}/) || url.includes('episode')) {
    return { type: 'series', confidence: 0.95 };
  }

  // 3. Check Group Title heuristics (Medium indicators)
  if (MOVIE_GROUPS.some(g => groupTitle.includes(g))) {
    // If it's in a movie group but has an M3U8 extension (typical of live TV), reduce confidence
    if (url.includes('.m3u8') || url.includes('/live/')) {
       return { type: 'movie', confidence: 0.4 }; 
    }
    return { type: 'movie', confidence: 0.8 };
  }
  if (SERIES_GROUPS.some(g => groupTitle.includes(g))) {
    if (url.includes('.m3u8') || url.includes('/live/')) {
       return { type: 'series', confidence: 0.4 }; 
    }
    return { type: 'series', confidence: 0.8 };
  }
  
  // 4. Check name for series patterns (Weak indicators)
  if (name.match(/s\d{2}e\d{2}/) || name.includes('episode')) {
    return { type: 'series', confidence: 0.7 };
  }

  // 5. Default fallback to Live TV
  // If it has .m3u8 or /live/ it's very likely live
  if (url.includes('.m3u8') || url.includes('/live/')) {
    return { type: 'live', confidence: 0.9 };
  }

  // Otherwise, default to live with low confidence
  return { type: 'live', confidence: 0.6 };
}
