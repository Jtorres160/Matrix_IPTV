# Recorded-Files Library — Design

**Date:** 2026-07-17
**Branch:** `fix/sqlite-refresh-sync`
**Status:** Approved (design), pending implementation plan

## Goal

Close the DVR loop from Phase 5. Recordings are captured as raw MPEG-TS (`.ts`)
files but nothing in the app can browse or play them. This feature adds a
**Recorded-Files Library**: browse saved captures, play them back in the
existing immersive (Phase-3) player with a real seekable progress bar, and
delete them.

## Non-goals (YAGNI)

- Rename recordings.
- Scheduled / EPG-based recordings.
- Catch-up / timeshift (Xtream archive).
- Configurable recordings folder.
- Migrating old Phase-5 test captures out of the Downloads root.

## Key constraints & known limitations

- **Chromium/react-player cannot play raw MPEG-TS.** react-player bundles hls.js
  internally, which demuxes HLS playlists, not a bare `.ts`. We add `mpegts.js`
  (MSE-based demuxer) as the decode path.
- **Raw MPEG-TS has no index.** Seeking and duration are best-effort
  (byte-offset approximation), not frame-accurate like MP4. This is accepted
  rather than bundling ffmpeg (~70 MB) into the portable build.
- **Duration is not in a TS header.** Card metadata is therefore `date · size`;
  duration is surfaced in the player once mpegts.js parses the stream. We do not
  probe every file on list load.

## Decisions

1. **Decode & serve — mpegts.js + loopback HTTP server.** The main process runs
   a tiny `http` server bound to `127.0.0.1:0` (ephemeral port) that serves files
   from the recordings directory with HTTP `Range` support. The renderer plays
   via `mpegts.js` pointed at that URL. Range support gives mpegts.js the best
   available seeking.
2. **Dedicated storage folder — `Downloads/Matrix Recordings/`.** RecordingManager
   writes captures there (created on demand). The library lists only this folder,
   so it never shows unrelated `.ts` files.
3. **Card metadata — `date · size`.** Duration shown in the player, not the card.
4. **Scope — browse · play · delete only.**

## Architecture

### Main process (`electron/main.cjs`)

- **RecordingManager save path:** change `downloadsPath` to
  `path.join(app.getPath('downloads'), 'Matrix Recordings')`, `fs.mkdir` recursive
  before writing.
- **Recording library IPC:**
  - `recording:list` → `[{ id, name, fileName, sizeBytes, mtimeMs }]`.
    `fs.readdir` the recordings dir, filter `*.ts`, `fs.stat` each. `id` is the
    file name (opaque); `name` is the file name with the trailing
    `_<ISO-timestamp>.ts` stripped for display.
  - `recording:delete(id)` → path-traversal-guarded `fs.unlink`. Resolve the id
    against the recordings dir and reject anything that escapes it.
  - `recording:getPlaybackBaseUrl` → `http://127.0.0.1:<port>`.
- **Loopback file server:** Node `http.createServer`, `listen(0, '127.0.0.1')`.
  For each request: decode the path, resolve against the recordings dir, reject
  (`403`) anything outside it or non-`.ts`; `404` if missing; otherwise stream
  with `Content-Type: video/mp2t`, `Accept-Ranges: bytes`, and honor `Range`
  (206 partial). Started once on app `ready`.

### Preload (`electron/preload.cjs`)

Extend `electronRecording` with `list()`, `delete(id)`, `getPlaybackBaseUrl()`.

### Renderer

- **`RecordingsView.jsx`** — replaces the bare `recordings` route. A remote-
  reachable segmented control with two segments:
  - **Library** — the new `RecordingLibrary`.
  - **Active** — the existing `RecordingDashboard` (live telemetry), unchanged.
- **`RecordingLibrary.jsx`** — D-pad grid of cards (poster placeholder + ▶
  overlay, title, `date · size` meta). Actions **Play** and **Delete (confirm)**.
  Polished empty state. Uses the existing `data-nav-zone` / `data-nav-index`
  navigation convention seen in `RecordingDashboard`.
- **`MpegtsPlayer.jsx`** — attaches `mpegts.js` to a `<video>` element, wired to
  `usePlayerStore` (play/pause/volume/seek) and publishing `duration` /
  `currentTime`. Cleans up the mpegts instance on unmount / source change.
- **`PlayerPreview.jsx`** — when `activeChannel.isRecording` is set, render
  `MpegtsPlayer` instead of `ReactPlayer`. All overlays/controls are reused.
- **`playerStore.js`** — add VOD fields: `duration`, `currentTime`, `isVOD`, and a
  `seek(t)` action. Set `isVOD` when playing a recording.
- **`PlayerControls.jsx`** — when `isVOD`, render a real seekbar (progress =
  `currentTime / duration`, click / left-right to seek) in place of the fake live
  bar.

### Play flow

Card ▶ builds a channel-like object
`{ id: 'rec:<fileName>', name, url: `${base}/${encodeURIComponent(fileName)}`,
isRecording: true }`, calls `usePlayerStore.setChannel(it)` and
`useAppStore.setIsImmersivePlayer(true)`. This reuses the entire Phase-3
immersive player (controls, overlay, status, reconnect).

## Error handling

- **List:** missing dir → empty state (not an error). Per-file `stat` failure →
  skip that file.
- **Delete:** confirm modal; unlink failure → toast, keep the card.
- **Playback:** mpegts.js `error` event routes through the existing
  `handleError` / `PlayerStatus`. Server `404` (file deleted mid-session) → same
  path.
- **Server:** paths outside the recordings dir → `403`; bound to loopback only.

## Testing (verification-before-completion, real Electron)

Playwright `_electron.launch` on `electron/main.cjs` with `ELECTRON_RUN_AS_NODE`
stripped from the child env. Harness:

1. Run a local byte-streaming HTTP server so the existing recording engine writes
   a real `.ts` into `Downloads/Matrix Recordings/`.
2. Drive end-to-end:
   - Library segment lists the recording.
   - **Play** enters the immersive player (`.bg-black.z-50`) and `currentTime`
     advances.
   - **Seek** moves the position.
   - **Delete** removes the card and the file from disk.

## New dependency

- `mpegts.js` (npm) — MSE-based MPEG-TS demuxer for the renderer.
