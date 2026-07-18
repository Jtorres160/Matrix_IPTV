/**
 * src/lib/media/vodParity.js
 *
 * Observational parity diagnostic for the M3U → SQLite VOD/Series pipeline,
 * mirroring the Live TV DB_CHANNEL_PARITY precedent (dbChannelAdapter.js):
 * compares DB-backed counts against renderer-classified counts after a sync.
 * Log-only; never throws, never mutates state, changes no behavior.
 *
 * NOTE: store/logger are imported lazily inside runVodParityCheck so the pure
 * comparator stays importable from plain-node test scripts.
 */

/**
 * Pure comparison — exported for tests.
 *
 * @param {Object} args
 * @param {number} args.rendererMovieCount   media.movies.length
 * @param {number} args.rendererEpisodeCount media.series.length (flat episodes)
 * @param {{vodCount:number, seriesCount:number, episodeCount:number}|null} args.dbStats
 */
export function compareVodParity({ rendererMovieCount, rendererEpisodeCount, dbStats }) {
  const stats = dbStats || { vodCount: -1, seriesCount: -1, episodeCount: -1 };
  return {
    moviesMatch: stats.vodCount === rendererMovieCount,
    episodesMatch: stats.episodeCount === rendererEpisodeCount,
    deltas: {
      movies: Math.abs(stats.vodCount - rendererMovieCount),
      episodes: Math.abs(stats.episodeCount - rendererEpisodeCount),
    },
  };
}

/**
 * Runs the diagnostic against the current appStore media state.
 * @param {Object} args
 * @param {string} args.playlistId
 * @returns {Promise<Object|null>} result, or null when unavailable
 */
export async function runVodParityCheck({ playlistId }) {
  try {
    if (typeof window === 'undefined' || !window.electronDB ||
        typeof window.electronDB.getMediaStats !== 'function' || !playlistId) {
      return null;
    }
    const [{ useAppStore }, { logger }] = await Promise.all([
      import('../../store/appStore.js'),
      import('../logger.js'),
    ]);
    const dbStats = await window.electronDB.getMediaStats(playlistId);
    const { media } = useAppStore.getState();
    const rendererMovieCount = (media && media.movies && media.movies.length) || 0;
    const rendererEpisodeCount = (media && media.series && media.series.length) || 0;

    const result = compareVodParity({ rendererMovieCount, rendererEpisodeCount, dbStats });

    logger.info('[VodParity] ── DB VOD/Series parity check ──');
    logger.info(`[VodParity] Movies:   renderer=${rendererMovieCount} sqlite=${dbStats ? dbStats.vodCount : 'n/a'} match=${result.moviesMatch ? 'YES' : 'NO'}`);
    logger.info(`[VodParity] Episodes: renderer=${rendererEpisodeCount} sqlite=${dbStats ? dbStats.episodeCount : 'n/a'} match=${result.episodesMatch ? 'YES' : 'NO'} (shows=${dbStats ? dbStats.seriesCount : 'n/a'})`);

    try {
      if (window.electronLog) {
        window.electronLog.write(
          result.moviesMatch && result.episodesMatch ? 'info' : 'warn',
          `[VodParity] movies r=${rendererMovieCount}/db=${dbStats?.vodCount} episodes r=${rendererEpisodeCount}/db=${dbStats?.episodeCount}`
        );
      }
    } catch { /* logging must never affect behavior */ }

    return result;
  } catch (err) {
    // console, not logger — the failure may predate the lazy logger import.
    console.error('[VodParity] check failed (non-fatal):', err);
    return null;
  }
}
