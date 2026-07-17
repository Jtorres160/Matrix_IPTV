/**
 * src/lib/player/tracks.js
 *
 * Enumerate and switch audio / subtitle tracks for the active stream. HLS
 * streams expose tracks through the hls.js instance (Chromium doesn't surface
 * multi-audio via the HTMLMediaElement API); progressive files expose subtitles
 * through the <video> element's textTracks.
 */

/** Reads available audio + subtitle tracks from the published media handles. */
export function readTracks(handles) {
  const result = { audio: [], subtitles: [{ id: -1, name: 'Off' }], hasHls: false };
  if (!handles) return result;

  let hls = null;
  try { hls = handles.getInternalPlayer && handles.getInternalPlayer('hls'); } catch { hls = null; }
  const video = handles.getVideo && handles.getVideo();

  if (hls) {
    result.hasHls = true;
    (hls.audioTracks || []).forEach((t, i) => {
      result.audio.push({ id: i, name: t.name || t.lang || `Audio ${i + 1}`, active: hls.audioTrack === i });
    });
    (hls.subtitleTracks || []).forEach((t, i) => {
      result.subtitles.push({ id: i, name: t.name || t.lang || `Subtitle ${i + 1}`, active: hls.subtitleTrack === i });
    });
    if (hls.subtitleTrack === -1) result.subtitles[0].active = true;
  }

  // Fallbacks for non-HLS playback.
  if (video) {
    if (result.audio.length === 0 && video.audioTracks) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        const t = video.audioTracks[i];
        result.audio.push({ id: i, name: t.label || t.language || `Audio ${i + 1}`, active: !!t.enabled });
      }
    }
    if (result.subtitles.length === 1 && video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const t = video.textTracks[i];
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          result.subtitles.push({ id: i, name: t.label || t.language || `Subtitle ${i + 1}`, active: t.mode === 'showing' });
        }
      }
    }
  }
  return result;
}

export function setAudioTrack(handles, id) {
  if (!handles) return;
  let hls = null;
  try { hls = handles.getInternalPlayer && handles.getInternalPlayer('hls'); } catch { hls = null; }
  if (hls) { hls.audioTrack = id; return; }
  const video = handles.getVideo && handles.getVideo();
  if (video && video.audioTracks) {
    for (let i = 0; i < video.audioTracks.length; i++) video.audioTracks[i].enabled = i === id;
  }
}

export function setSubtitleTrack(handles, id) {
  if (!handles) return;
  let hls = null;
  try { hls = handles.getInternalPlayer && handles.getInternalPlayer('hls'); } catch { hls = null; }
  if (hls) {
    hls.subtitleTrack = id;             // -1 disables
    hls.subtitleDisplay = id >= 0;
  }
  const video = handles.getVideo && handles.getVideo();
  if (video && video.textTracks) {
    for (let i = 0; i < video.textTracks.length; i++) {
      const t = video.textTracks[i];
      if (t.kind === 'subtitles' || t.kind === 'captions') t.mode = i === id ? 'showing' : 'disabled';
    }
  }
}
