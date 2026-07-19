/**
 * electron/shared/mediaClassifier.mjs
 *
 * Heuristics-based classifier to separate generic channel objects into
 * 'live', 'movie', or 'series'.
 */

const MOVIE_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v'];
// Stems, not whole words: 'movie' matches both "Movie" and "Movies"; 'serie'
// matches both "Serie" (Spanish/French singular) and "Series". Generic
// (non-Xtream) M3U providers use a wide variety of category naming, so this
// list is deliberately broader than Xtream's own conventions.
const MOVIE_GROUPS = ['movie', 'vod', 'cinema', 'netflix', 'film', 'pelicula', 'filme', 'on demand', 'ppv', 'blockbuster', 'cine'];
const SERIES_GROUPS = ['serie', 'tv show', 'shows', 'season', 'dizi', 'temporada'];

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

  // 1b. Explicit tvg-type attribute from the M3U (#EXTINF tvg-type="...").
  //     Providers that label their entries are authoritative — no guessing.
  const tvgType = normalize(row.tvg_type || row.tvgType || '');
  if (tvgType === 'live') return { type: 'live', confidence: 1.0 };
  if (tvgType === 'movie' || tvgType === 'movies' || tvgType === 'vod') {
    return { type: 'movie', confidence: 1.0 };
  }
  if (tvgType === 'tvshow' || tvgType === 'tvshows' || tvgType === 'series' ||
      tvgType === 'show' || tvgType === 'shows') {
    return { type: 'series', confidence: 1.0 };
  }

  const groupTitle = normalize(row.group_title || row.group || row.groupTitle || '');
  const url = normalize(row.stream_url || row.url || '');
  const name = normalize(row.name || row.title || '');

  // A season/episode marker (S01E01, s1e1, or 1x01) in the name or URL.
  // Tolerant of the 1- or 2-digit variants providers use.
  const episodePattern = /\bs\d{1,2}\s?e\d{1,2}\b|\b\d{1,2}x\d{2}\b/;
  // Spelled-out episode pattern: "Show Name Season 1 Episode 2". Separators
  // mirror seriesGrouping's SPELLED_RE ([\s._-]) so the classifier and the
  // grouper agree on dotted/underscored file names like
  // "The.Office.Season.2.Episode.3.mp4".
  const spelledOutPattern = /season[\s._-]+\d{1,2}[\s._-]+(?:episode|ep\.?)[\s._-]*\d{1,3}/i;

  // 2. Series is the STRONGEST content signal and must be checked before the
  //    movie-extension heuristic. Xtream series episodes are delivered as
  //    .mkv/.mp4 files on a /series/ path, so a naive "has a video extension =>
  //    movie" test files every episode as a movie and leaves the Series tab
  //    empty. Season/episode markers, an /episode tag, or an Xtream /series/
  //    path win outright.
  if (episodePattern.test(name) || episodePattern.test(url) || spelledOutPattern.test(name) ||
      url.includes('/series/') || url.includes('episode')) {
    return { type: 'series', confidence: 0.95 };
  }

  // 3. Movie by URL path convention (mirrors the /series/ check above — many
  //    resellers mimic Xtream's /movie/ path even on a plain M3U export).
  if (url.includes('/movie/') || url.includes('/vod/')) {
    return { type: 'movie', confidence: 0.9 };
  }

  // 4. Movie by video-file extension (now that series files are excluded).
  //    Anchored to the END of the URL path — a substring test turned live
  //    channel slugs like "fox.movies.rs.m3u8" into movies via ".mov".
  const urlPath = url.split(/[?#]/)[0];
  if (MOVIE_EXTENSIONS.some(ext => urlPath.endsWith(ext))) {
    return { type: 'movie', confidence: 0.95 };
  }

  // 5. Check Group Title heuristics (Medium indicators). Series group beats
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

  // 6. Title carries a release year like "Inception (2010)" — a strong movie
  //    signal on generic (non-Xtream) M3U exports whose group-titles don't
  //    match any keyword above. Skipped for anything already looking live.
  const yearPattern = /\((19|20)\d{2}\)\s*$/;
  if (yearPattern.test(name) && !url.includes('.m3u8') && !url.includes('/live/')) {
    return { type: 'movie', confidence: 0.7 };
  }

  // 7. Default fallback to Live TV
  // If it has .m3u8 or /live/ it's very likely live
  if (url.includes('.m3u8') || url.includes('/live/')) {
    return { type: 'live', confidence: 0.9 };
  }

  // Otherwise, default to live with low confidence
  return { type: 'live', confidence: 0.6 };
}
