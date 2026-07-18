# Matrix IPTV — Session Handoff

Android / Firestick–targeted IPTV player (Electron + React + Zustand).
Branch: `fix/sqlite-refresh-sync`. Everything below was **built, verified by
driving the real Electron app, and committed**.

## How to run / test (for the next session)
- Build: `npm run build` (Vite → `dist/`).
- Drive: `playwright-core` `_electron.launch` on `electron/main.cjs`; **delete
  `ELECTRON_RUN_AS_NODE`** from the child env (VS Code sets it and Electron then
  runs as plain Node and fails).
- Seed content without a real provider: write the profile to **electron-store**
  key `iptv.profiles.v2` (zustand-persist shape `{state:{…},version:2}`) and the
  channels to **IndexedDB** DB `MatrixIPTV_Cache`, store `playlists` (keyPath
  `url`), then `page.reload()`. Detect the immersive player via
  `.bg-black.z-50` + `.opacity-0.pointer-events-none`.
- Working drive scripts live in the session scratchpad (`p1-series.cjs` …
  `p5-dvr.cjs`, `explore.cjs`).

## Bug fixes (committed before the phases)
- **Back button** while watching only cleared `currentView`, not
  `isImmersivePlayer`, so the player stayed pinned on top until reload. Fixed in
  `PlayerControls.handleBack` (mirrors the App-level Escape/Back handler).
- **Series misclassified as movies**: `mediaClassifier` checked video-file
  extensions (`.mkv`/`.mp4`) before the `SxxExx`/`/series/` markers, so every
  Xtream episode landed in Movies and the Series tab was empty. Series markers
  now win first.
- **EPG guide** rendered raw XMLTV timestamps → `ProgramCard` now formats
  `start`/`stop` as clock times.
- **Live TV category ribbon** listed VOD/Series groups (which filtered to
  empty) → now derived from the live channel set.

## Phase 1 — Series detail  (commit 61b4d47)
Show → Season → Episode. `lib/media/seriesGrouping.js` parses
`"Show S01E02"` / `"1x03"`; `VODLibrary` renders one card per show and opens
the remote-navigable `SeriesDetailOverlay` (Continue = next unwatched, season
column, episode list, watched checkmarks). Autoplay-next: player store
`seriesQueue` + `PlayerPreview.onEnded → playNextInSeries`.
- **Left to do:** per-second resume (currently episode-level "Continue" only);
  DB-backed **Xtream series** via `get_series_info` (flat M3U episodes work; DB
  `series` rows have no direct URL and need the series-info API to list
  episodes).

## Phase 2 — Remote-reachable search  (commit 3451603)
`Search` item in the sidebar + bottom nav opens the command palette (was
Ctrl/Cmd+K only). Input auto-focuses (surfaces the Fire TV keyboard); Back on
an empty box closes.

## Phase 3 — Playback controls  (commit aa08a94)
Audio/subtitle track menu (`lib/player/tracks.js`, hls.js instance + `<video>`
`textTracks` fallback), aspect/zoom cycle Fit→Fill→Stretch (`object-fit`, `a`
key), and auto-reconnect with backoff (6 tries, 2–15 s, resets on a good play;
`PlayerStatus` shows "Reconnecting…").
- **Left to do:** live multi-audio / multi-subtitle **switching** needs a real
  multi-track stream to fully verify (enumeration + switch wiring is defensive).

## Phase 4 — Xtream account panel  (commit c98d97b)
The Xtream tab shows a live account card per saved Xtream source from
`player_api.php` `user_info`: active/expired + trial badge, expiry with
days-left (red under 3 days), active/allowed connections, server + timezone,
with a manual refresh.

## Phase 5 — DVR / recordings  (commit 8b153d7)
Surfaced the existing recording engine (`RecordingManager` in `main.cjs`,
`electronRecording` IPC, `useRecordingTelemetry`, `RecordingDashboard`):
`Recordings` route + nav entry, and a **Record** button in the player.
Verified with a local stream server (real `.ts` written to Downloads, live
size telemetry on the dashboard card).
- **Left to do:** recorded-files **library** (browse/play the saved `.ts`);
  scheduled/EPG-based recordings; **catch-up / timeshift** (Xtream archive) —
  the single biggest remaining IPTV feature.

## Suggested next priorities
1. Recorded-files library + play saved recordings (closes the DVR loop).
2. Catch-up / timeshift TV (Xtream `archive`/`timeshift`).
3. Series per-second resume + DB Xtream series episodes (`get_series_info`).
4. Verify multi-audio/subtitle switching against a real multi-track stream.
5. EPG-based scheduled recordings.
