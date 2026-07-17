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

  // A season/episode marker (S01E01, s1e1) in the name or URL. Tolerant of the
  // 1- or 2-digit variants providers use.
  const episodePattern = /\bs\d{1,2}\s?e\d{1,2}\b/;

  // 2. Series is the STRONGEST content signal and must be checked before the
  //    movie-extension heuristic. Xtream series episodes are delivered as
  //    .mkv/.mp4 files on a /series/ path, so a naive "has a video extension =>
  //    movie" test files every episode as a movie and leaves the Series tab
  //    empty. Season/episode markers, an /episode tag, or an Xtream /series/
  //    path win outright.
  if (episodePattern.test(name) || episodePattern.test(url) ||
      url.includes('/series/') || url.includes('episode')) {
    return { type: 'series', confidence: 0.95 };
  }

  // 3. Movie by video-file extension (now that series files are excluded).
  if (MOVIE_EXTENSIONS.some(ext => url.includes(ext))) {
    return { type: 'movie', confidence: 0.95 };
  }

  // 4. Check Group Title heuristics (Medium indicators). Series group beats
  //    movie group when both somehow match.
  if (SERIES_GROUPS.some(g => groupTitle.includes(g))) {
    if (url.includes('.m3u8') || url.includes('/live/')) {
       return { type: 'series', confidence: 0.4 };
    }
    return { type: 'series', confidence: 0.8 };
  }
  if (MOVIE_GROUPS.some(g => groupTitle.includes(g))) {
    // If it's in a movie group but has an M3U8 extension (typical of live TV), reduce confidence
    if (url.includes('.m3u8') || url.includes('/live/')) {
       return { type: 'movie', confidence: 0.4 };
    }
    return { type: 'movie', confidence: 0.8 };
  }

  // 5. Default fallback to Live TV
  // If it has .m3u8 or /live/ it's very likely live
  if (url.includes('.m3u8') || url.includes('/live/')) {
    return { type: 'live', confidence: 0.9 };
  }

  // Otherwise, default to live with low confidence
  return { type: 'live', confidence: 0.6 };
}
