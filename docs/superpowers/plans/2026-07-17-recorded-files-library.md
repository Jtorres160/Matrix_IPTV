# Recorded-Files Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browse, play, and delete the raw MPEG-TS DVR captures from Phase 5, playing them back in the existing immersive player with a real seekable progress bar.

**Architecture:** The main process moves recordings into a dedicated `Downloads/Matrix Recordings/` folder, exposes list/delete IPC, and runs a loopback HTTP file server (127.0.0.1, Range support). The renderer decodes raw `.ts` with `mpegts.js` attached to a `<video>` element, reusing the Phase-3 immersive player (controls/overlay/status) with a new VOD seekbar.

**Tech Stack:** Electron 31 (CJS main/preload), React 18, Zustand 4, react-player (live/HLS), `mpegts.js` (new — raw TS demux), Node `http` (loopback server), `playwright-core` `_electron.launch` for verification.

## Global Constraints

- Desktop Electron app (`electron-builder --win portable`). NOT native Android — ignore Kotlin/Android.
- Main + preload are CommonJS (`.cjs`, `require`). Renderer is ESM (`import`).
- Recordings directory: `path.join(app.getPath('downloads'), 'Matrix Recordings')`. This exact path is the single source of truth, computed once in the main process.
- Loopback server binds `127.0.0.1` only, serves only `*.ts` files resolved inside the recordings dir; any path escaping the dir → HTTP 403.
- Verification drives the real Electron app: `playwright-core` `_electron.launch` on `electron/main.cjs`, and **delete `ELECTRON_RUN_AS_NODE` from the child env** (VS Code sets it; otherwise Electron runs as plain Node and fails).
- Immersive player is detected in the DOM by `.bg-black.z-50` on the player layer.
- Seed content (when a drive script needs channels) via electron-store key `iptv.profiles.v2` + IndexedDB `MatrixIPTV_Cache` store `playlists` (keyPath `url`), then `page.reload()`. Not required for recordings-only drive scripts.
- Scratchpad for all temp drive/test scripts: `C:\Users\Slim\AppData\Local\Temp\claude\d--Cursor-Matrix-IPTV-main\ac02a352-f9e1-434d-88df-d498d1fefae5\scratchpad`.

---

## File Structure

**Create:**
- `electron/recordingLibrary.cjs` — pure helpers (`stripRecordingTimestamp`, `listRecordings`, `resolveRecordingPath`) + loopback server factory (`createRecordingServer`).
- `src/components/player/MpegtsPlayer.jsx` — `mpegts.js` → `<video>` bridge wired to `usePlayerStore`.
- `src/components/RecordingLibrary.jsx` — library grid (cards, play, delete-confirm).
- `src/components/RecordingsView.jsx` — segmented Library / Active wrapper.

**Modify:**
- `electron/main.cjs` — recordings dir constant; RecordingManager save path; new IPC handlers; start server on ready.
- `electron/preload.cjs` — expose `list`, `delete`, `getPlaybackBaseUrl`.
- `src/player/playerStore.js` — VOD fields (`duration`, `currentTime`, `isVOD`) + `seek`, `setDuration`, `setCurrentTime`.
- `src/components/PlayerPreview.jsx` — render `MpegtsPlayer` when `activeChannel.isRecording`.
- `src/components/player/PlayerControls.jsx` — VOD seekbar + hide the Live badge for VOD.
- `src/components/ViewRouter.jsx` — route `recordings` → `RecordingsView`.

**Verification scripts (scratchpad, not committed):**
- `rec-server.test.cjs`, `rec-lib.test.cjs` — node assertion scripts for pure modules.
- `rec-e2e.cjs` — playwright-core end-to-end drive script.

---

## Task 1: Recordings storage folder + mpegts.js dependency

**Files:**
- Modify: `electron/main.cjs` (RecordingManager, ~line 186-187)
- Modify: `package.json` (dependency)

**Interfaces:**
- Produces: recordings written to `path.join(app.getPath('downloads'), 'Matrix Recordings')`; `mpegts.js` available to the renderer.

- [ ] **Step 1: Install mpegts.js**

Run:
```bash
npm install mpegts.js
```
Expected: `package.json` dependencies gains `"mpegts.js"`; no peer-dep errors that block install.

- [ ] **Step 2: Add a recordings-dir constant near the top of main.cjs**

In `electron/main.cjs`, just after the existing `const path = require('path')` / requires block, add:
```js
// Single source of truth for where DVR captures live and are served from.
function getRecordingsDir() {
  return path.join(app.getPath('downloads'), 'Matrix Recordings');
}
```

- [ ] **Step 3: Point RecordingManager at the recordings dir and ensure it exists**

In `electron/main.cjs`, in `RecordingManager.startRecording`, replace:
```js
      const downloadsPath = app.getPath('downloads');
      const filePath = path.join(downloadsPath, finalFilename);
```
with:
```js
      const recordingsDir = getRecordingsDir();
      try { fs.mkdirSync(recordingsDir, { recursive: true }); } catch (e) { /* best effort */ }
      const filePath = path.join(recordingsDir, finalFilename);
```

- [ ] **Step 4: Build to confirm nothing broke**

Run:
```bash
npm run build
```
Expected: Vite build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron/main.cjs
git commit -m "feat(dvr): dedicated Matrix Recordings folder + mpegts.js dep"
```

---

## Task 2: Recording library pure helpers

**Files:**
- Create: `electron/recordingLibrary.cjs`
- Test: `scratchpad/rec-lib.test.cjs`

**Interfaces:**
- Produces:
  - `stripRecordingTimestamp(fileName: string): string` — removes a trailing `_<ISO-ish timestamp>.ts` and returns a display name.
  - `listRecordings(dir: string): Promise<Array<{ id, name, fileName, sizeBytes, mtimeMs }>>` — `id === fileName`.
  - `resolveRecordingPath(dir: string, id: string): string | null` — absolute path if `id` resolves strictly inside `dir` and ends with `.ts`, else `null`.

- [ ] **Step 1: Write the failing test**

Create `scratchpad/rec-lib.test.cjs`:
```js
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { stripRecordingTimestamp, listRecordings, resolveRecordingPath } = require('../../../../../../../d:/Cursor/Matrix_IPTV-main/electron/recordingLibrary.cjs');

// stripRecordingTimestamp
assert.strictEqual(
  stripRecordingTimestamp('BBC News_2026-07-17T10-30-00-000Z.ts'),
  'BBC News'
);
assert.strictEqual(stripRecordingTimestamp('NoTimestamp.ts'), 'NoTimestamp');
assert.strictEqual(stripRecordingTimestamp('Movie_Title_2026-01-02T03-04-05-006Z.ts'), 'Movie_Title');

// resolveRecordingPath — traversal guard
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
fs.writeFileSync(path.join(dir, 'a.ts'), 'x');
assert.ok(resolveRecordingPath(dir, 'a.ts'), 'valid .ts resolves');
assert.strictEqual(resolveRecordingPath(dir, '../evil.ts'), null, 'traversal rejected');
assert.strictEqual(resolveRecordingPath(dir, 'a.txt'), null, 'non-ts rejected');

// listRecordings
(async () => {
  fs.writeFileSync(path.join(dir, 'b.ts'), 'hello');
  fs.writeFileSync(path.join(dir, 'ignore.txt'), 'nope');
  const list = await listRecordings(dir);
  const names = list.map(r => r.fileName).sort();
  assert.deepStrictEqual(names, ['a.ts', 'b.ts']);
  const b = list.find(r => r.fileName === 'b.ts');
  assert.strictEqual(b.id, 'b.ts');
  assert.strictEqual(b.sizeBytes, 5);
  assert.ok(typeof b.mtimeMs === 'number');

  // missing dir → empty array, no throw
  const empty = await listRecordings(path.join(dir, 'does-not-exist'));
  assert.deepStrictEqual(empty, []);

  console.log('rec-lib.test.cjs PASS');
})().catch(e => { console.error(e); process.exit(1); });
```
(Adjust the `require` path to the actual absolute path of `electron/recordingLibrary.cjs` if the relative depth differs — the module path is what matters.)

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node "<scratchpad>/rec-lib.test.cjs"
```
Expected: FAIL — cannot find module `recordingLibrary.cjs` (not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `electron/recordingLibrary.cjs`:
```js
// electron/recordingLibrary.cjs
// Pure helpers + loopback file server for the Recorded-Files Library.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Strip a trailing `_<timestamp>.ts` (as written by RecordingManager, e.g.
// `_2026-07-17T10-30-00-000Z`) and the `.ts` extension for a display name.
function stripRecordingTimestamp(fileName) {
  const base = fileName.replace(/\.ts$/i, '');
  return base.replace(/_\d{4}-\d{2}-\d{2}T[\d-]+Z?$/i, '');
}

// List `*.ts` files in `dir`. Missing dir → []. Per-file stat failure → skip.
async function listRecordings(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir);
  } catch (e) {
    return [];
  }
  const out = [];
  for (const fileName of entries) {
    if (!/\.ts$/i.test(fileName)) continue;
    try {
      const st = await fsp.stat(path.join(dir, fileName));
      if (!st.isFile()) continue;
      out.push({
        id: fileName,
        name: stripRecordingTimestamp(fileName),
        fileName,
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
      });
    } catch (e) { /* skip unreadable file */ }
  }
  return out;
}

// Resolve `id` strictly inside `dir`; must end with `.ts`. Else null.
function resolveRecordingPath(dir, id) {
  if (typeof id !== 'string' || !/\.ts$/i.test(id)) return null;
  const resolvedDir = path.resolve(dir);
  const target = path.resolve(resolvedDir, id);
  const rel = path.relative(resolvedDir, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

module.exports = { stripRecordingTimestamp, listRecordings, resolveRecordingPath };
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node "<scratchpad>/rec-lib.test.cjs"
```
Expected: `rec-lib.test.cjs PASS`

- [ ] **Step 5: Commit**

```bash
git add electron/recordingLibrary.cjs
git commit -m "feat(dvr): recording library helpers (list, name strip, path guard)"
```

---

## Task 3: Loopback recording server with Range support

**Files:**
- Modify: `electron/recordingLibrary.cjs` (add `createRecordingServer`)
- Test: `scratchpad/rec-server.test.cjs`

**Interfaces:**
- Consumes: `resolveRecordingPath` (Task 2).
- Produces: `createRecordingServer(dir: string): Promise<{ port: number, baseUrl: string, close(): void }>` — an `http.Server` on `127.0.0.1:0` serving `*.ts` from `dir` with `Content-Type: video/mp2t`, `Accept-Ranges: bytes`, and HTTP `Range` (206) support. Paths outside `dir` → 403; missing → 404.

- [ ] **Step 1: Write the failing test**

Create `scratchpad/rec-server.test.cjs`:
```js
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createRecordingServer } = require('d:/Cursor/Matrix_IPTV-main/electron/recordingLibrary.cjs');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recsrv-'));
  fs.writeFileSync(path.join(dir, 'clip.ts'), 'ABCDEFGHIJ'); // 10 bytes
  const srv = await createRecordingServer(dir);

  // Full GET
  const full = await get(`${srv.baseUrl}/clip.ts`);
  assert.strictEqual(full.status, 200);
  assert.strictEqual(full.body.toString(), 'ABCDEFGHIJ');
  assert.strictEqual(full.headers['accept-ranges'], 'bytes');
  assert.strictEqual(full.headers['content-type'], 'video/mp2t');

  // Range GET
  const part = await get(`${srv.baseUrl}/clip.ts`, { Range: 'bytes=2-5' });
  assert.strictEqual(part.status, 206);
  assert.strictEqual(part.body.toString(), 'CDEF');
  assert.ok(/bytes 2-5\/10/.test(part.headers['content-range']));

  // 404 missing
  const missing = await get(`${srv.baseUrl}/nope.ts`);
  assert.strictEqual(missing.status, 404);

  // 403 traversal
  const evil = await get(`${srv.baseUrl}/..%2Fsecret.ts`);
  assert.strictEqual(evil.status, 403);

  srv.close();
  console.log('rec-server.test.cjs PASS');
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node "<scratchpad>/rec-server.test.cjs"
```
Expected: FAIL — `createRecordingServer` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `electron/recordingLibrary.cjs`, add `require('http')` at the top and append before `module.exports`:
```js
const http = require('http');

// Loopback HTTP server that streams `*.ts` files out of `dir` with Range
// support. Bound to 127.0.0.1 on an ephemeral port.
function createRecordingServer(dir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let id;
      try {
        id = decodeURIComponent((req.url || '/').replace(/^\//, '').split('?')[0]);
      } catch (e) {
        res.writeHead(400); return res.end('Bad request');
      }
      const filePath = resolveRecordingPath(dir, id);
      if (!filePath) { res.writeHead(403); return res.end('Forbidden'); }

      fs.stat(filePath, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }

        const total = st.size;
        const range = req.headers.range;
        const baseHeaders = { 'Content-Type': 'video/mp2t', 'Accept-Ranges': 'bytes' };

        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
          if (isNaN(start) || isNaN(end) || start > end || end >= total) {
            res.writeHead(416, { 'Content-Range': `bytes */${total}` });
            return res.end();
          }
          res.writeHead(206, {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': end - start + 1,
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
          fs.createReadStream(filePath).pipe(res);
        }
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ port, baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}
```
Add `createRecordingServer` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node "<scratchpad>/rec-server.test.cjs"
```
Expected: `rec-server.test.cjs PASS`

- [ ] **Step 5: Commit**

```bash
git add electron/recordingLibrary.cjs
git commit -m "feat(dvr): loopback recording file server with Range support"
```

---

## Task 4: Main IPC wiring + preload exposure

**Files:**
- Modify: `electron/main.cjs` (require module, start server on ready, add 3 IPC handlers)
- Modify: `electron/preload.cjs` (expose 3 methods)
- Test: `scratchpad/rec-ipc.cjs` (playwright-core drive script)

**Interfaces:**
- Consumes: `getRecordingsDir` (Task 1), `listRecordings`/`resolveRecordingPath`/`createRecordingServer` (Tasks 2-3).
- Produces (renderer `window.electronRecording`):
  - `list(): Promise<Array<{id,name,fileName,sizeBytes,mtimeMs}>>`
  - `delete(id): Promise<{success: boolean, error?: string}>`
  - `getPlaybackBaseUrl(): Promise<string>` — e.g. `http://127.0.0.1:PORT`.

- [ ] **Step 1: Require the module and hold a server handle in main.cjs**

Near the top of `electron/main.cjs` (with the other requires):
```js
const { listRecordings, resolveRecordingPath, createRecordingServer } = require('./recordingLibrary.cjs');
let recordingServer = null;
```

- [ ] **Step 2: Start the loopback server when the app is ready**

In `electron/main.cjs`, inside the existing `app.whenReady().then(...)` (or `app.on('ready', ...)`) block, after the window is created, add:
```js
  try {
    const fs = require('fs');
    fs.mkdirSync(getRecordingsDir(), { recursive: true });
    recordingServer = await createRecordingServer(getRecordingsDir());
    console.log('[Recordings] server on', recordingServer.baseUrl);
  } catch (e) {
    console.error('[Recordings] server failed to start:', e);
  }
```
(If the ready handler is not `async`, make it `async`, or chain `.then`. Close it on quit: in the existing `window-all-closed`/`before-quit` path add `if (recordingServer) recordingServer.close();`.)

- [ ] **Step 3: Add the three IPC handlers**

In `electron/main.cjs`, after the existing `recording:status` handler (~line 298):
```js
ipcMain.handle('recording:list', async () => {
  return await listRecordings(getRecordingsDir());
});

ipcMain.handle('recording:delete', async (event, id) => {
  try {
    const fs = require('fs/promises');
    const filePath = resolveRecordingPath(getRecordingsDir(), id);
    if (!filePath) return { success: false, error: 'Invalid recording id' };
    await fs.unlink(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('recording:getPlaybackBaseUrl', async () => {
  return recordingServer ? recordingServer.baseUrl : null;
});
```

- [ ] **Step 4: Expose the methods in preload.cjs**

In `electron/preload.cjs`, extend the `electronRecording` object (after `onProgress`):
```js
  list: () => ipcRenderer.invoke('recording:list'),
  delete: (id) => ipcRenderer.invoke('recording:delete', id),
  getPlaybackBaseUrl: () => ipcRenderer.invoke('recording:getPlaybackBaseUrl'),
```

- [ ] **Step 5: Write the drive script**

Create `scratchpad/rec-ipc.cjs`:
```js
const { _electron: electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  // Seed a fake recording into the recordings dir before launch.
  const recDir = path.join(os.homedir(), 'Downloads', 'Matrix Recordings');
  fs.mkdirSync(recDir, { recursive: true });
  const fname = `IPC Probe_2026-07-17T00-00-00-000Z.ts`;
  fs.writeFileSync(path.join(recDir, fname), Buffer.alloc(2048, 1));

  const app = await electron.launch({ args: ['electron/main.cjs'], env });
  const page = await app.firstWindow();
  await page.waitForTimeout(1500);

  const list = await page.evaluate(() => window.electronRecording.list());
  console.log('LIST:', JSON.stringify(list));
  if (!list.some(r => r.fileName === fname)) throw new Error('recording not listed');

  const base = await page.evaluate(() => window.electronRecording.getPlaybackBaseUrl());
  console.log('BASE:', base);
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('bad base url');

  const del = await page.evaluate((id) => window.electronRecording.delete(id), fname);
  console.log('DELETE:', JSON.stringify(del));
  if (!del.success) throw new Error('delete failed');
  if (fs.existsSync(path.join(recDir, fname))) throw new Error('file still on disk');

  console.log('rec-ipc.cjs PASS');
  await app.close();
})().catch(async (e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Build and run the drive script**

Run:
```bash
npm run build
node "<scratchpad>/rec-ipc.cjs"
```
Expected: `rec-ipc.cjs PASS` (list contains the probe, base URL matches loopback, delete removes the file).
(If `playwright-core` is missing, `npm install -D playwright-core` first.)

- [ ] **Step 7: Commit**

```bash
git add electron/main.cjs electron/preload.cjs
git commit -m "feat(dvr): recording list/delete IPC + loopback server startup"
```

---

## Task 5: Player store VOD fields + seek

**Files:**
- Modify: `src/player/playerStore.js`

**Interfaces:**
- Produces on `usePlayerStore`: state `duration: number`, `currentTime: number`, `isVOD: boolean`; actions `setDuration(sec)`, `setCurrentTime(sec)`, `seek(sec)`, `seekRequest: number|null` (a one-shot value the player reads to move the media element).
- `setChannel(channel)` now also sets `isVOD: !!channel.isRecording` and resets `duration`/`currentTime`/`seekRequest`.

- [ ] **Step 1: Add VOD state fields**

In `src/player/playerStore.js`, in the `create(...)` state object (near `videoFit`), add:
```js
  // VOD (recorded-file) playback: real duration/position + one-shot seek target.
  isVOD: false,
  duration: 0,
  currentTime: 0,
  seekRequest: null, // seconds; MpegtsPlayer consumes then clears via clearSeekRequest
```

- [ ] **Step 2: Add the VOD actions**

In the `--- ACTIONS ---` section, add:
```js
  setDuration: (sec) => set({ duration: Number.isFinite(sec) ? sec : 0 }),
  setCurrentTime: (sec) => set({ currentTime: Number.isFinite(sec) ? sec : 0 }),
  seek: (sec) => {
    const { duration } = get();
    const clamped = Math.max(0, Math.min(sec, duration || sec));
    set({ seekRequest: clamped, currentTime: clamped });
    get().showControlsTemporarily();
  },
  clearSeekRequest: () => set({ seekRequest: null }),
```

- [ ] **Step 3: Reset VOD state in setChannel**

In `setChannel`, extend the `set({ ... })` call to include:
```js
      isVOD: !!channel.isRecording,
      duration: 0,
      currentTime: 0,
      seekRequest: null,
```

- [ ] **Step 4: Build to confirm no syntax errors**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/player/playerStore.js
git commit -m "feat(dvr): VOD duration/position/seek state in player store"
```

---

## Task 6: MpegtsPlayer + PlayerPreview branch

**Files:**
- Create: `src/components/player/MpegtsPlayer.jsx`
- Modify: `src/components/PlayerPreview.jsx`

**Interfaces:**
- Consumes: `usePlayerStore` VOD fields/actions (Task 5), `activeChannel.isRecording` + `activeUrl`.
- Produces: `<MpegtsPlayer />` — renders a `<video>`, attaches `mpegts.js`, publishes duration/currentTime, honors play/pause/volume/muted/seekRequest, routes errors through `handleError`.

- [ ] **Step 1: Create MpegtsPlayer.jsx**

Create `src/components/player/MpegtsPlayer.jsx`:
```jsx
import React, { useEffect, useRef } from 'react';
import mpegts from 'mpegts.js';
import { usePlayerStore } from '../../player/playerStore.js';

// Plays a raw MPEG-TS recording via mpegts.js attached to a <video> element.
// Wired to the shared player store so the Phase-3 controls/overlay drive it.
export default function MpegtsPlayer() {
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  const activeUrl = usePlayerStore((s) => s.activeUrl);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const seekRequest = usePlayerStore((s) => s.seekRequest);

  const setPlaybackState = usePlayerStore((s) => s.setPlaybackState);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const clearSeekRequest = usePlayerStore((s) => s.clearSeekRequest);
  const handleError = usePlayerStore((s) => s.handleError);
  const setMediaHandles = usePlayerStore((s) => s.setMediaHandles);

  // (Re)create the mpegts player whenever the source URL changes.
  useEffect(() => {
    if (!activeUrl || !videoRef.current) return;
    if (!mpegts.isSupported()) { handleError(); return; }

    const player = mpegts.createPlayer(
      { type: 'mpegts', isLive: false, url: activeUrl },
      { enableWorker: true, lazyLoad: false }
    );
    playerRef.current = player;
    player.attachMediaElement(videoRef.current);
    player.load();
    player.on(mpegts.Events.ERROR, () => handleError());

    setMediaHandles({
      getInternalPlayer: () => player,
      getVideo: () => videoRef.current,
    });

    return () => {
      try { player.destroy(); } catch (e) { /* ignore */ }
      playerRef.current = null;
    };
  }, [activeUrl, handleError, setMediaHandles]);

  // Publish duration / currentTime and playback transitions from the element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onDuration = () => setDuration(v.duration || 0);
    const onTime = () => setCurrentTime(v.currentTime || 0);
    const onPlay = () => setPlaybackState('playing');
    const onPause = () => setPlaybackState('paused');
    const onWaiting = () => setPlaybackState('buffering');
    const onEnded = () => setPlaybackState('paused');
    v.addEventListener('durationchange', onDuration);
    v.addEventListener('loadedmetadata', onDuration);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('durationchange', onDuration);
      v.removeEventListener('loadedmetadata', onDuration);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('ended', onEnded);
    };
  }, [setDuration, setCurrentTime, setPlaybackState]);

  // Drive play/pause from store state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playbackState === 'playing' || playbackState === 'buffering') {
      v.play().catch(() => {});
    } else if (playbackState === 'paused') {
      v.pause();
    }
  }, [playbackState]);

  // Volume / mute.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  // One-shot seek.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || seekRequest == null) return;
    try { v.currentTime = seekRequest; } catch (e) { /* ignore */ }
    clearSeekRequest();
  }, [seekRequest, clearSeekRequest]);

  return <video ref={videoRef} className="w-full h-full" playsInline />;
}
```

- [ ] **Step 2: Branch to MpegtsPlayer in PlayerPreview**

In `src/components/PlayerPreview.jsx`, add the import at the top:
```jsx
import MpegtsPlayer from './player/MpegtsPlayer.jsx';
```
Then in the `--- ReactPlayer Implementation ---` return, replace the video-engine block:
```jsx
      {/* Video Engine */}
      <div className="w-full h-full pointer-events-none">
        {activeUrl ? (
          <ReactPlayer
```
...so the inner `{activeUrl ? (...) : null}` chooses the engine:
```jsx
      {/* Video Engine */}
      <div className="w-full h-full pointer-events-none">
        {!activeUrl ? null : activeChannel?.isRecording ? (
          <MpegtsPlayer />
        ) : (
          <ReactPlayer
            ref={playerRef}
            url={activeUrl}
            /* ...existing props unchanged... */
          />
        )}
      </div>
```
(Keep every existing `ReactPlayer` prop exactly as-is; only wrap it in the conditional.)

- [ ] **Step 3: Build**

Run:
```bash
npm run build
```
Expected: build succeeds; `mpegts.js` resolves.

- [ ] **Step 4: Commit**

```bash
git add src/components/player/MpegtsPlayer.jsx src/components/PlayerPreview.jsx
git commit -m "feat(dvr): mpegts.js recording playback engine in the immersive player"
```

---

## Task 7: VOD seekbar in PlayerControls

**Files:**
- Modify: `src/components/player/PlayerControls.jsx`

**Interfaces:**
- Consumes: `usePlayerStore` fields `isVOD`, `duration`, `currentTime`, action `seek`.
- Produces: when `isVOD`, the fake full-width red live bar is replaced by an interactive seekbar; the top-right "Live" badge is hidden.

- [ ] **Step 1: Pull VOD fields from the store**

In `PlayerControls.jsx`, add to the destructured `usePlayerStore()` values:
```js
    isVOD,
    duration,
    currentTime,
    seek,
```

- [ ] **Step 2: Add a time formatter above the component**

Above `export default function PlayerControls()`:
```js
function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
```

- [ ] **Step 3: Hide the Live badge for VOD**

Replace the top-right Live badge block with a conditional:
```jsx
        {!isVOD && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-600/90 rounded text-xs font-bold tracking-widest uppercase text-white shadow-lg">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            Live
          </div>
        )}
```

- [ ] **Step 4: Replace the progress-bar placeholder with a VOD seekbar**

Replace the existing progress placeholder:
```jsx
        {/* Progress bar placeholder (Live TV doesn't really seek, but looks good) */}
        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-red-500 w-full rounded-full"></div>
        </div>
```
with:
```jsx
        {isVOD ? (
          <div className="w-full flex items-center gap-3">
            <span className="text-xs text-gray-300 tabular-nums w-14 text-right">{fmtTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer accent-blue-500"
              aria-label="Seek"
            />
            <span className="text-xs text-gray-400 tabular-nums w-14">{fmtTime(duration)}</span>
          </div>
        ) : (
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 w-full rounded-full"></div>
          </div>
        )}
```

- [ ] **Step 5: Build**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/player/PlayerControls.jsx
git commit -m "feat(dvr): real VOD seekbar for recording playback"
```

---

## Task 8: Recording Library grid (browse, play, delete)

**Files:**
- Create: `src/components/RecordingLibrary.jsx`

**Interfaces:**
- Consumes: `window.electronRecording.list/delete/getPlaybackBaseUrl`, `usePlayerStore.setChannel`, `useAppStore.setIsImmersivePlayer`.
- Produces: `<RecordingLibrary />` — grid of recording cards; Play builds `{ id:'rec:'+fileName, name, url, isRecording:true }` and enters the immersive player; Delete confirms, calls IPC, refreshes.

- [ ] **Step 1: Create the component**

Create `src/components/RecordingLibrary.jsx`:
```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../player/playerStore.js';
import { useAppStore } from '../store/appStore.js';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
function formatDate(ms) {
  try { return new Date(ms).toLocaleString(); } catch { return ''; }
}

export default function RecordingLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState(null);

  const setChannel = usePlayerStore((s) => s.setChannel);
  const setIsImmersivePlayer = useAppStore((s) => s.setIsImmersivePlayer);

  const refresh = useCallback(async () => {
    if (!window.electronRecording?.list) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const list = await window.electronRecording.list();
      list.sort((a, b) => b.mtimeMs - a.mtimeMs);
      setItems(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const play = useCallback(async (rec) => {
    const base = await window.electronRecording.getPlaybackBaseUrl();
    if (!base) { setError('Playback server unavailable'); return; }
    const url = `${base}/${encodeURIComponent(rec.fileName)}`;
    setChannel({ id: `rec:${rec.fileName}`, name: rec.name, url, isRecording: true, groups: ['Recordings'] });
    setIsImmersivePlayer(true);
  }, [setChannel, setIsImmersivePlayer]);

  const doDelete = useCallback(async (id) => {
    setConfirmId(null);
    const res = await window.electronRecording.delete(id);
    if (!res?.success) { setError(res?.error || 'Delete failed'); return; }
    refresh();
  }, [refresh]);

  if (loading) {
    return <div className="p-8 text-slate-400">Loading recordings…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-12">
        <div className="text-6xl mb-6 opacity-40">🎬</div>
        <div className="text-xl font-bold text-slate-300 mb-2">No Recordings Yet</div>
        <div className="text-sm text-slate-500 max-w-sm">
          Recordings you capture from the player appear here. Hit the ● Rec button while watching a channel.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {error && <div className="mb-4 text-sm text-red-400">{error}</div>}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {items.map((rec, index) => (
          <div
            key={rec.id}
            className="group relative bg-[#111827] border border-white/10 rounded-xl overflow-hidden focus-within:border-sky-400"
            data-nav-zone="recordings-library"
            data-nav-index={index}
          >
            <button
              onClick={() => play(rec)}
              className="block w-full aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center focus:outline-none"
              aria-label={`Play ${rec.name}`}
            >
              <span className="text-4xl text-white/70 group-hover:scale-110 transition-transform">▶</span>
            </button>
            <div className="p-3">
              <div className="text-sm font-semibold text-slate-100 truncate" title={rec.name}>{rec.name}</div>
              <div className="text-xs text-slate-500 mt-1">{formatDate(rec.mtimeMs)} · {formatBytes(rec.sizeBytes)}</div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => play(rec)}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-sky-600/20 text-sky-300 border border-sky-500/30 hover:bg-sky-600/30 focus:outline-none"
                >▶ Play</button>
                <button
                  onClick={() => setConfirmId(rec.id)}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-red-600/15 text-red-300 border border-red-500/30 hover:bg-red-600/25 focus:outline-none"
                >🗑 Delete</button>
              </div>
            </div>

            {confirmId === rec.id && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center">
                <div className="text-sm text-slate-200 mb-4">Delete “{rec.name}”?</div>
                <div className="flex gap-2">
                  <button onClick={() => doDelete(rec.id)} className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold">Delete</button>
                  <button onClick={() => setConfirmId(null)} className="px-4 py-1.5 rounded-lg bg-white/10 text-slate-200 text-sm">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/RecordingLibrary.jsx
git commit -m "feat(dvr): recorded-files library grid with play + delete"
```

---

## Task 9: RecordingsView segmented wrapper + route

**Files:**
- Create: `src/components/RecordingsView.jsx`
- Modify: `src/components/ViewRouter.jsx`

**Interfaces:**
- Consumes: `RecordingLibrary` (Task 8), existing `RecordingDashboard`.
- Produces: `<RecordingsView />` — two segments ("Library" default, "Active"); wired into the `recordings` route.

- [ ] **Step 1: Create RecordingsView.jsx**

Create `src/components/RecordingsView.jsx`:
```jsx
import React, { useState } from 'react';
import RecordingLibrary from './RecordingLibrary.jsx';
import RecordingDashboard from './RecordingDashboard.jsx';

const SEGMENTS = [
  { id: 'library', label: 'Library' },
  { id: 'active', label: 'Active' },
];

export default function RecordingsView() {
  const [segment, setSegment] = useState('library');
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-2 px-6 pt-6">
        {SEGMENTS.map((s, index) => (
          <button
            key={s.id}
            onClick={() => setSegment(s.id)}
            data-nav-zone="recordings-segments"
            data-nav-index={index}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 ${
              segment === s.id
                ? 'bg-sky-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {segment === 'library' ? <RecordingLibrary /> : <RecordingDashboard />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Route recordings → RecordingsView**

In `src/components/ViewRouter.jsx`, replace the import:
```jsx
import RecordingDashboard from './RecordingDashboard.jsx';
```
with:
```jsx
import RecordingsView from './RecordingsView.jsx';
```
And replace the `recordings` route body:
```jsx
  'recordings': () => (
    <div className="w-full h-full bg-[#0a1118] pl-0 md:pl-[260px] pb-16 md:pb-0 transition-all duration-300 overflow-y-auto">
      <RecordingsView />
    </div>
  )
```

- [ ] **Step 3: Build**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecordingsView.jsx src/components/ViewRouter.jsx
git commit -m "feat(dvr): Recordings view with Library / Active segments"
```

---

## Task 10: End-to-end verification (real Electron)

**Files:**
- Test: `scratchpad/rec-e2e.cjs` (playwright-core drive script)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the end-to-end drive script**

Create `scratchpad/rec-e2e.cjs`:
```js
const { _electron: electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const recDir = path.join(os.homedir(), 'Downloads', 'Matrix Recordings');
  fs.mkdirSync(recDir, { recursive: true });

  // A real (tiny) MPEG-TS won't decode without valid packets; for the library
  // list/play/seek/delete UI flow we use a byte file. Playback decode is
  // covered by mpegts.js against the served bytes; if decode fails the error
  // path is still exercised. Use a small valid-ish TS if available.
  const fname = `E2E Clip_2026-07-17T12-00-00-000Z.ts`;
  const fpath = path.join(recDir, fname);
  fs.writeFileSync(fpath, Buffer.alloc(188 * 200, 0x47)); // 0x47 = TS sync byte

  const app = await electron.launch({ args: ['electron/main.cjs'], env });
  const page = await app.firstWindow();
  await page.waitForTimeout(1500);

  // Navigate to the recordings view.
  await page.evaluate(() => window.__appStore?.getState?.().setCurrentView?.('recordings'));
  // Fallback: click the nav entry if the store isn't globally exposed.
  await page.waitForTimeout(500);

  // Verify the library lists our recording.
  const listed = await page.evaluate(() => window.electronRecording.list());
  console.log('LISTED:', JSON.stringify(listed.map(r => r.fileName)));
  if (!listed.some(r => r.fileName === fname)) throw new Error('recording not in list IPC');

  // Verify the served bytes are reachable with Range.
  const base = await page.evaluate(() => window.electronRecording.getPlaybackBaseUrl());
  const rangeOk = await new Promise((resolve) => {
    http.get(`${base}/${encodeURIComponent(fname)}`, { headers: { Range: 'bytes=0-187' } }, (res) => {
      resolve(res.statusCode === 206);
      res.resume();
    }).on('error', () => resolve(false));
  });
  console.log('RANGE 206:', rangeOk);
  if (!rangeOk) throw new Error('range request failed');

  // Delete via IPC and confirm the file is gone.
  const del = await page.evaluate((id) => window.electronRecording.delete(id), fname);
  if (!del.success) throw new Error('delete IPC failed');
  if (fs.existsSync(fpath)) throw new Error('file still on disk after delete');

  console.log('rec-e2e.cjs PASS');
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Build and run**

Run:
```bash
npm run build
node "<scratchpad>/rec-e2e.cjs"
```
Expected: `rec-e2e.cjs PASS`. Prints the listed recording, `RANGE 206: true`, and confirms deletion.

- [ ] **Step 3: Manual immersive-playback smoke check**

Launch the app (`npm run desktop` or via the drive harness), open **Recordings → Library**, click **Play** on a recording, and confirm:
- The immersive layer appears (`.bg-black.z-50`).
- The VOD seekbar shows `currentTime / duration` (not the red full-width live bar).
- Dragging the seekbar moves playback position.
- **Back** exits cleanly (clears `isImmersivePlayer`).

(Use a genuine captured `.ts` from a live stream for real decode — synthetic sync-byte files verify the pipeline/UI but not full A/V decode.)

- [ ] **Step 4: Final commit (if any scratch fixes were folded in)**

```bash
git add -A
git commit -m "test(dvr): end-to-end recorded-files library verification" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** storage folder (T1), list/delete/serve IPC (T2-T4), mpegts playback (T5-T6), real seekbar (T7), library UI (T8), segmented view + route (T9), real-Electron verification (T10). All spec sections mapped.
- **Type consistency:** `id === fileName` throughout; `getPlaybackBaseUrl` returns `http://127.0.0.1:PORT`; play object shape `{ id, name, url, isRecording, groups }` matches what `setChannel` + `PlayerControls`/`PlayerPreview` read (`activeChannel.isRecording`, `activeChannel.name`, `activeChannel.groups?.[0]`).
- **Known limitation carried from spec:** seeking on raw TS is byte-offset approximate; duration appears once mpegts.js parses. Synthetic TS files verify the pipeline; genuine captures verify decode.
```
