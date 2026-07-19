import { validatePlaylistUrl } from './validators.js';
import { processPlaylistText } from './m3uParser.js';
import { expandPlaylistUrls } from '../../../electron/shared/multiListProvider.mjs';

export async function loadPlaylist(url, abortSignal, onProgress) {
  try {
    if (onProgress) onProgress('validating', 'Checking playlist link...');
    const validation = validatePlaylistUrl(url);
    if (!validation.isValid) {
      return { success: false, error: validation.error, channels: [], channelCount: 0 };
    }

    // Multi-list providers serve live/movies/tvshows as sibling URLs of the
    // saved livetv URL — fetch every list the account offers. Optional lists
    // are best-effort (a live-only account just 404s them).
    const sources = expandPlaylistUrls(validation.url);

    if (onProgress) onProgress('downloading', 'Downloading playlist...');
    let channels = [];
    let categories = [];
    let epgUrl = null;
    for (const src of sources) {
      let text = null;
      try {
        const res = await fetch(src.url, { signal: abortSignal });
        if (res.ok) text = await res.text();
      } catch (err) {
        if (err.name === 'AbortError' || src.required) throw err;
      }
      if (!text || text.trim().length === 0) {
        if (src.required) {
          return { success: false, error: 'No channels were found.', channels: [], channelCount: 0 };
        }
        continue;
      }

      if (onProgress) onProgress('parsing', 'Reading channels...');
      const parsed = processPlaylistText(text);
      channels = channels.concat(parsed.channels);
      categories = [...new Set([...categories, ...parsed.categories])].sort();
      if (!epgUrl) epgUrl = parsed.epgUrl;
    }

    if (channels.length === 0) {
      return { success: false, error: 'No channels were found.', channels: [], channelCount: 0 };
    }

    if (onProgress) onProgress('ready', `Found ${channels.length} channels`);

    return {
      success: true,
      channels,
      categories,
      epgUrl,
      channelCount: channels.length,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request cancelled.', channels: [], channelCount: 0, aborted: true };
    }
    return { success: false, error: 'Unable to download playlist.', channels: [], channelCount: 0 };
  }
}
