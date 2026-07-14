import { validatePlaylistUrl } from './validators.js';
import { processPlaylistText } from './m3uParser.js';

export async function loadPlaylist(url, abortSignal, onProgress) {
  try {
    if (onProgress) onProgress('validating', 'Checking playlist link...');
    const validation = validatePlaylistUrl(url);
    if (!validation.isValid) {
      return { success: false, error: validation.error, channels: [], channelCount: 0 };
    }

    if (onProgress) onProgress('downloading', 'Downloading playlist...');
    const res = await fetch(validation.url, { signal: abortSignal });
    if (!res.ok) {
      return { success: false, error: 'Unable to download playlist.', channels: [], channelCount: 0 };
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) {
      return { success: false, error: 'No channels were found.', channels: [], channelCount: 0 };
    }

    if (onProgress) onProgress('parsing', 'Reading channels...');
    const { channels, categories, epgUrl } = processPlaylistText(text);

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
