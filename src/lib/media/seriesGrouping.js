/**
 * src/lib/media/seriesGrouping.js
 *
 * Turns the flat list of series *episodes* that an M3U/Xtream playlist produces
 * (each a MediaItem named like "Breaking Bad S01E01") into a Show → Season →
 * Episode hierarchy the UI can browse.
 */

// "Show S01E01 Title", "Show s1e1", "Show 1x01" — capture show, season, episode
// and any trailing episode title.
const EP_RE = /^(.*?)[\s._\-]*(?:[Ss](\d{1,2})[\s._\-]*[Ee](\d{1,2})|(\d{1,2})x(\d{2}))(.*)$/;

// Spelled-out fallback for providers that don't use SxxExx/NxNN at all, e.g.
// "Show Name Season 1 Episode 2" or "Show Name Season 01 Ep 3 - Title".
const SPELLED_RE = /^(.*?)[\s._\-]*season[\s._\-]*(\d{1,2})[\s._\-]*(?:episode|ep\.?)[\s._\-]*(\d{1,3})(.*)$/i;

function cleanTitle(s) {
  return (s || '')
    .replace(/[._]+/g, ' ')
    .replace(/\s*[-–—:]\s*$/, '')
    .replace(/^\s*[-–—:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses an episode label into { show, season, episode, epTitle }, or null when
 * no season/episode marker is present.
 */
export function parseEpisode(rawName) {
  if (!rawName) return null;
  const str = String(rawName).trim();

  const m = EP_RE.exec(str);
  if (m) {
    const season = parseInt(m[2] != null ? m[2] : m[4], 10);
    const episode = parseInt(m[3] != null ? m[3] : m[5], 10);
    if (!Number.isNaN(season) && !Number.isNaN(episode)) {
      return {
        show: cleanTitle(m[1]) || 'Unknown Show',
        season,
        episode,
        epTitle: cleanTitle(m[6]) || '',
      };
    }
  }

  const m2 = SPELLED_RE.exec(str);
  if (m2) {
    const season = parseInt(m2[2], 10);
    const episode = parseInt(m2[3], 10);
    if (!Number.isNaN(season) && !Number.isNaN(episode)) {
      return {
        show: cleanTitle(m2[1]) || 'Unknown Show',
        season,
        episode,
        epTitle: cleanTitle(m2[4]) || '',
      };
    }
  }

  return null;
}

/**
 * Groups a flat episode list into show objects:
 *   { key, show, poster, group, seasons: Map<number, Episode[]>,
 *     seasonNumbers: number[], episodes: Episode[] (flat, ordered), episodeCount }
 * Episodes with no parseable marker become a single-episode "show" so nothing is
 * silently dropped.
 */
export function groupSeries(items) {
  const shows = new Map();

  for (const item of items || []) {
    const parsed = parseEpisode(item.name || item.title);
    const showName = parsed ? parsed.show : cleanTitle(item.name || item.title) || 'Unknown';
    const season = parsed ? parsed.season : 1;
    const episode = parsed ? parsed.episode : 0;

    if (!shows.has(showName)) {
      shows.set(showName, {
        key: showName,
        show: showName,
        poster: item.poster || item.logo || item.cover || null,
        group: item.group || 'Series',
        seasons: new Map(),
        episodes: [],
      });
    }
    const showObj = shows.get(showName);
    if (!showObj.poster) showObj.poster = item.poster || item.logo || item.cover || null;

    const epObj = { ...item, _season: season, _episode: episode, _epTitle: parsed ? parsed.epTitle : '' };
    showObj.episodes.push(epObj);
    if (!showObj.seasons.has(season)) showObj.seasons.set(season, []);
    showObj.seasons.get(season).push(epObj);
  }

  for (const showObj of shows.values()) {
    for (const eps of showObj.seasons.values()) eps.sort((a, b) => a._episode - b._episode);
    showObj.episodes.sort((a, b) => a._season - b._season || a._episode - b._episode);
    showObj.seasonNumbers = [...showObj.seasons.keys()].sort((a, b) => a - b);
    showObj.episodeCount = showObj.episodes.length;
  }

  return [...shows.values()].sort((a, b) => a.show.localeCompare(b.show));
}

/** A compact "S01·E02" style label for an episode. */
export function episodeLabel(ep) {
  const s = String(ep._season ?? 1).padStart(2, '0');
  const e = String(ep._episode ?? 0).padStart(2, '0');
  return `S${s}·E${e}`;
}
