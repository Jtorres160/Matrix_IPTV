# Continue Watching (per-second resume) — Design

**Date:** 2026-07-17
**Branch:** `fix/sqlite-refresh-sync`
**Status:** Approved (design)

## Goal

Save playback position per on-demand item and auto-resume it on replay, plus a
"Continue Watching" rail so users can jump back into partially-watched content.
Turns the app's episode-level resume into true per-second resume across
movies, series episodes, and recordings.

## Non-goals (v1, YAGNI)

- Live TV resume (nothing to resume).
- "Resume vs Start over" prompt — auto-resume, scrub back via the seekbar.
- Cross-device / cloud sync.
- Reworking the existing frequency-based `ContinueWatchingRail` (orphaned; left
  untouched).

## Key facts (verified in code)

- All on-demand playback funnels through `playMediaItem` → `setChannel`
  (`mediaResolver.js`). MediaItems carry `{ id, name, url, poster, type }`
  (with legacy aliases from `mediaAdapter.js`).
- Today only recordings set `isVOD` (via `channel.isRecording`); movies/series
  play through `ReactPlayer` with no position tracking and no seek.
- `MpegtsPlayer` already publishes `currentTime`/`duration` to `playerStore`.
- Persistence uses zustand `persist` + `createJSONStorage` over
  `window.electronStore` (see `profileStore.ts`, key `iptv.profiles.v2`).

## Decisions

1. **One persisted position store** (`resumeStore`, key `iptv.resume.v1`); both
   engines report into `playerStore.currentTime`/`duration`, a single saver
   effect persists.
2. **Broaden `isVOD`** to `isRecording || type==='movie' || type==='series'` so
   on-demand content gets the real seekbar + seek capability (live stays false).
3. **Auto-resume** on player-ready when a saved position `< 95%` exists.
4. **Clear** the entry at `≥ 95%` or `ended` (item leaves the rail).
5. **Rail** mounted above the virtualized list in Movies (type `movie`) and
   Series (type `series`) views.

## Architecture

### `src/store/resumeStore.js` (new)
- zustand + `persist`(`iptv.resume.v1`, storage = `electronStore` wrapper).
- State: `positions: { [id]: { id, name, poster, type, url, positionSec, durationSec, updatedAt } }`.
- Actions:
  - `savePosition(item, positionSec, durationSec)` — upsert; ignore if
    `durationSec` unknown/0 or `positionSec < 3`.
  - `clearPosition(id)`.
  - `getPosition(id)` — returns entry or null.
- Selector helper `selectInProgress(state, types, limit)` — entries with
  `3s < pos < 0.95·dur`, filtered to `types`, sorted by `updatedAt` desc.

### `playerStore.js` (modify)
- `setChannel`: `isVOD = !!channel.isRecording || channel.type === 'movie' || channel.type === 'series'`.

### `PlayerPreview.jsx` (modify)
- `ReactPlayer` gains `onDuration={(d)=>setDuration(d)}` and
  `onProgress={({playedSeconds})=>setCurrentTime(playedSeconds)}`
  (`progressInterval={1000}`), and holds `playerRef` (already present).
- **Saver effect:** for on-demand items (`isVOD`), throttle-save
  `currentTime`/`duration` to `resumeStore` every ~5 s and on pause/ended/unmount.
- **Resume-seek effect:** once per source, when the player is ready and a saved
  position `< 95%` exists, seek: `playerRef.seekTo(pos,'seconds')` (ReactPlayer)
  or rely on `playerStore.seek(pos)` → `seekRequest` (mpegts).
- **Clear-on-complete:** when `currentTime ≥ 0.95·duration` or `onEnded`, call
  `clearPosition(id)`.

### `src/components/tv/ResumeRail.jsx` (new)
- Props: `types` (e.g. `['movie']`), `onPlay`.
- Reads `resumeStore` via `selectInProgress`; renders a horizontal rail of cards
  (poster + title + bottom progress bar = `pos/dur`). Empty → renders nothing.
- Card click → `onPlay(item)`.

### `VODLibrary.jsx` (modify)
- Mount `<ResumeRail types={isMovies?['movie']:['series']} onPlay={playMediaItem} />`
  inside `styles.wrapper`, above the `.vod-container` scroll area (so it never
  perturbs the virtualized row math).

## Error handling
- Missing/zero duration → don't save (avoids poisoning the rail).
- `electronStore` unavailable → store still works in-memory for the session.
- Seek failure → swallowed; playback continues from 0.

## Testing (real Electron, playwright)
The resume mechanism is validated with a **local recording** (mpegts + loopback
server — no provider needed), which shares the exact code path with movies/series:
1. Play a recording, let `currentTime` advance, exit → assert `resumeStore` has
   the position.
2. Re-enter → `currentTime` resumes near the saved value.
3. Force ≥95% → entry cleared.
The **rail** is validated by seeding a `type:'movie'` entry into
`iptv.resume.v1`, opening Movies, asserting the card renders with a progress bar,
and that clicking it enters the player.

## New dependencies
None.
