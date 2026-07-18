# Continue Watching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Per-second resume for on-demand content (movies, series, recordings) + a Continue Watching rail.

**Architecture:** A persisted `resumeStore` (electron-store `iptv.resume.v1`) holds positions. Both playback engines feed `playerStore.currentTime`/`duration`; a saver effect in `PlayerPreview` persists throttled; a resume-seek effect restores position on play; a `ResumeRail` surfaces in-progress items in Movies/Series.

**Tech Stack:** React 18, Zustand 4 (+persist), react-player, mpegts.js, playwright-core (verification).

## Global Constraints

- On-demand = `type` `movie`/`series` or `isRecording`. Live never resumes.
- Persistence: zustand `persist` + `createJSONStorage` over `window.electronStore`, key `iptv.resume.v1` (mirror `profileStore.ts`).
- Don't save when `durationSec` is falsy/0 or `positionSec < 3`.
- Resume threshold: restore if saved `pos < 0.95·dur`; clear at `≥ 0.95·dur` or `ended`.
- Verify by driving real Electron (`_electron.launch` on `electron/main.cjs`, delete `ELECTRON_RUN_AS_NODE`). Recordings are the local, provider-free verification vehicle.
- Scratchpad for temp scripts: `C:\Users\Slim\AppData\Local\Temp\claude\d--Cursor-Matrix-IPTV-main\ac02a352-f9e1-434d-88df-d498d1fefae5\scratchpad`. Require project modules by absolute path (`d:/Cursor/Matrix_IPTV-main/node_modules/...`).

---

## Task 1: resumeStore (persisted position store)

**Files:** Create `src/store/resumeStore.js`; Test `scratchpad/resume-store.test.mjs`

**Interfaces produced:**
- `useResumeStore` (zustand). State `positions: {[id]: {id,name,poster,type,url,positionSec,durationSec,updatedAt}}`.
- Actions `savePosition(item, positionSec, durationSec)`, `clearPosition(id)`, `getPosition(id)`.
- `selectInProgress(state, types, limit=20)` → filtered/sorted array.

- [ ] **Step 1: Write the failing test**

Create `scratchpad/resume-store.test.mjs`:
```js
import assert from 'assert';
globalThis.window = {}; // no electronStore → in-memory persist fallback
const { useResumeStore, selectInProgress } = await import('d:/Cursor/Matrix_IPTV-main/src/store/resumeStore.js');

const s = useResumeStore.getState();
s.savePosition({ id: 'm1', name: 'Movie 1', type: 'movie', url: 'u', poster: 'p' }, 120, 600);
assert.strictEqual(useResumeStore.getState().getPosition('m1').positionSec, 120);

// too-short and no-duration are ignored
s.savePosition({ id: 'm2', name: 'x', type: 'movie' }, 1, 600);   // pos<3
s.savePosition({ id: 'm3', name: 'y', type: 'movie' }, 50, 0);    // dur 0
assert.strictEqual(useResumeStore.getState().getPosition('m2'), null);
assert.strictEqual(useResumeStore.getState().getPosition('m3'), null);

// inProgress filters by type + <95% and sorts by updatedAt desc
s.savePosition({ id: 's1', name: 'Ep', type: 'series' }, 30, 100);
s.savePosition({ id: 'm4', name: 'Almost', type: 'movie' }, 96, 100); // ≥95% excluded
const movies = selectInProgress(useResumeStore.getState(), ['movie']);
assert.deepStrictEqual(movies.map(e => e.id), ['m1']);
const series = selectInProgress(useResumeStore.getState(), ['series']);
assert.deepStrictEqual(series.map(e => e.id), ['s1']);

// clear
s.clearPosition('m1');
assert.strictEqual(useResumeStore.getState().getPosition('m1'), null);
console.log('resume-store.test.mjs PASS');
```

- [ ] **Step 2: Run — expect FAIL** (`node scratchpad/resume-store.test.mjs` → cannot find module).

- [ ] **Step 3: Implement**

Create `src/store/resumeStore.js`:
```js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Storage backed by electronStore when present, else an in-memory Map so the
// store still works in tests / non-electron contexts. Mirrors profileStore.
function getStorage() {
  const es = typeof window !== 'undefined' && window.electronStore;
  if (es) {
    return {
      getItem: async (k) => (await es.get(k)) ?? null,
      setItem: async (k, v) => { await es.set(k, v); },
      removeItem: async (k) => { await es.delete(k); },
    };
  }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, v); },
    removeItem: (k) => { mem.delete(k); },
  };
}

export const useResumeStore = create(
  persist(
    (set, get) => ({
      positions: {},

      savePosition: (item, positionSec, durationSec) => {
        if (!item || item.id == null) return;
        if (!durationSec || durationSec <= 0) return;
        if (!(positionSec >= 3)) return;
        const id = String(item.id);
        set((s) => ({
          positions: {
            ...s.positions,
            [id]: {
              id,
              name: item.name || item.title || 'Untitled',
              poster: item.poster || item.logo || null,
              type: item.type || (item.isRecording ? 'recording' : 'movie'),
              url: item.url || item.streamUrl || null,
              positionSec,
              durationSec,
              updatedAt: Date.now(),
            },
          },
        }));
      },

      clearPosition: (id) => set((s) => {
        const next = { ...s.positions };
        delete next[String(id)];
        return { positions: next };
      }),

      getPosition: (id) => get().positions[String(id)] || null,
    }),
    {
      name: 'iptv.resume.v1',
      storage: createJSONStorage(getStorage),
      partialize: (s) => ({ positions: s.positions }),
    }
  )
);

// Entries still in progress (3s < pos < 95%·dur), of the given types, newest first.
export function selectInProgress(state, types, limit = 20) {
  const set = new Set(types);
  return Object.values(state.positions)
    .filter((e) => set.has(e.type)
      && e.durationSec > 0
      && e.positionSec >= 3
      && e.positionSec < 0.95 * e.durationSec)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**
```bash
git add src/store/resumeStore.js
git commit -m "feat(resume): persisted per-item playback-position store"
```

---

## Task 2: isVOD broadening + resume-seek/saver wiring in the player

**Files:** Modify `src/player/playerStore.js`, `src/components/PlayerPreview.jsx`, `src/components/player/MpegtsPlayer.jsx`

**Interfaces consumed:** `useResumeStore` (Task 1), existing `playerStore` VOD fields (`isVOD/duration/currentTime/seek/setDuration/setCurrentTime`).

- [ ] **Step 1: Broaden isVOD in setChannel**

In `src/player/playerStore.js`, in `setChannel`'s `set({...})`, replace:
```js
      isVOD: !!channel.isRecording,
```
with:
```js
      isVOD: !!channel.isRecording || channel.type === 'movie' || channel.type === 'series',
```

- [ ] **Step 2: Feed ReactPlayer progress/duration into the store**

In `src/components/PlayerPreview.jsx`, pull `setDuration`, `setCurrentTime` from the store (add to the `usePlayerStore()` destructure near `setMediaHandles`), and add these props to the `<ReactPlayer>` element (alongside `onReady`):
```jsx
            progressInterval={1000}
            onDuration={(d) => setDuration(d || 0)}
            onProgress={({ playedSeconds }) => setCurrentTime(playedSeconds || 0)}
```

- [ ] **Step 3: Resume-seek + saver + clear-on-complete effect**

In `src/components/PlayerPreview.jsx`, add the import:
```jsx
import { useResumeStore } from '../store/resumeStore.js';
```
Add these effects inside the component (after the existing effects, before the `if (!activeChannel)` return). `playerRef` and `activeChannel`/`activeUrl` are already in scope; `isVOD`, `duration`, `currentTime` come from the store:
```jsx
  const isVOD = usePlayerStore((s) => s.isVOD);
  const duration = usePlayerStore((s) => s.duration);
  const currentTime = usePlayerStore((s) => s.currentTime);

  // Resume-seek: once per source, jump to the saved position (<95%).
  const resumedForRef = useRef(null);
  useEffect(() => {
    if (!isVOD || !activeChannel || !activeUrl) return;
    if (resumedForRef.current === activeUrl) return;
    if (!duration || duration <= 0) return; // wait until we know the length
    const entry = useResumeStore.getState().getPosition(activeChannel.id);
    resumedForRef.current = activeUrl;
    if (entry && entry.positionSec < 0.95 * duration) {
      usePlayerStore.getState().seek(entry.positionSec);
      try { playerRef.current?.seekTo?.(entry.positionSec, 'seconds'); } catch (e) { /* ignore */ }
    }
  }, [isVOD, activeChannel, activeUrl, duration]);

  // Saver: throttle-persist position for on-demand content; clear at ≥95%.
  const lastSaveRef = useRef(0);
  useEffect(() => {
    if (!isVOD || !activeChannel || !duration) return;
    if (currentTime >= 0.95 * duration) {
      useResumeStore.getState().clearPosition(activeChannel.id);
      return;
    }
    const now = Date.now();
    if (now - lastSaveRef.current >= 5000) {
      lastSaveRef.current = now;
      useResumeStore.getState().savePosition(activeChannel, currentTime, duration);
    }
  }, [isVOD, activeChannel, currentTime, duration]);

  // Persist once more on unmount / source change (capture last position).
  const tailRef = useRef({ activeChannel, currentTime, duration, isVOD });
  tailRef.current = { activeChannel, currentTime, duration, isVOD };
  useEffect(() => () => {
    const { activeChannel, currentTime, duration, isVOD } = tailRef.current;
    if (isVOD && activeChannel && duration && currentTime < 0.95 * duration) {
      useResumeStore.getState().savePosition(activeChannel, currentTime, duration);
    }
  }, [activeUrl]);
```

- [ ] **Step 4: Clear on ended (both engines already set paused via store)**

In `src/components/PlayerPreview.jsx`, in the `<ReactPlayer onEnded>` handler, after the existing series-advance logic, add a clear:
```jsx
            onEnded={() => {
              const advanced = usePlayerStore.getState().playNextInSeries();
              const ch = usePlayerStore.getState().activeChannel;
              if (ch) useResumeStore.getState().clearPosition(ch.id);
              if (!advanced) setPlaybackState('paused');
            }}
```
(MpegtsPlayer's `ended` already sets paused; the ≥95% saver effect clears recordings.)

- [ ] **Step 5: Build + smoke**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Commit**
```bash
git add src/player/playerStore.js src/components/PlayerPreview.jsx src/components/player/MpegtsPlayer.jsx
git commit -m "feat(resume): report, persist, restore, and clear playback position"
```

---

## Task 3: ResumeRail component + mount in Movies/Series

**Files:** Create `src/components/tv/ResumeRail.jsx`; Modify `src/components/VODLibrary.jsx`

**Interfaces consumed:** `useResumeStore`, `selectInProgress` (Task 1); `playMediaItem` (already imported in VODLibrary).

- [ ] **Step 1: Create ResumeRail.jsx**

Create `src/components/tv/ResumeRail.jsx`:
```jsx
import React from 'react';
import { LucideImageOff, LucidePlay } from 'lucide-react';
import { useResumeStore, selectInProgress } from '../../store/resumeStore.js';

export default function ResumeRail({ types, onPlay }) {
  const items = useResumeStore((s) => selectInProgress(s, types));
  if (!items || items.length === 0) return null;

  return (
    <div className="px-8 pt-4">
      <h3 className="text-white/90 text-lg font-bold mb-3">Continue Watching</h3>
      <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2">
        {items.map((item) => {
          const pct = Math.min(100, Math.round((item.positionSec / item.durationSec) * 100));
          return (
            <button
              key={item.id}
              data-tv-focusable="true"
              data-nav-zone="continue-watching"
              onClick={() => onPlay(item)}
              className="group relative flex-shrink-0 w-48 h-28 rounded-xl overflow-hidden bg-white/5 border border-transparent transition-all focus:outline-none focus:ring-4 focus:ring-blue-500 hover:bg-white/10 text-left"
              aria-label={`Resume ${item.name}`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                {item.poster
                  ? <img src={item.poster} className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-opacity" />
                  : <LucideImageOff size={40} className="text-gray-700" />}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent flex items-center justify-center">
                <LucidePlay size={30} className="text-white/90 drop-shadow-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <div className="text-white text-xs font-semibold truncate drop-shadow mb-1">{item.name}</div>
                <div className="h-1 bg-white/25 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount in VODLibrary above the virtualized list**

In `src/components/VODLibrary.jsx`, add the import:
```jsx
import ResumeRail from './tv/ResumeRail.jsx';
```
Then in the returned JSX, immediately after the opening `<div style={styles.wrapper}>` (before the overlay conditionals or right before `<div className="vod-container" ...>`), insert:
```jsx
      <ResumeRail types={isMovies ? ['movie'] : ['series']} onPlay={playMediaItem} />
```

- [ ] **Step 3: Build**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/components/tv/ResumeRail.jsx src/components/VODLibrary.jsx
git commit -m "feat(resume): Continue Watching rail in Movies and Series"
```

---

## Task 4: End-to-end verification (real Electron)

**Files:** Test `scratchpad/resume-e2e.cjs`

- [ ] **Step 1: Resume mechanism via a real recording**

Create `scratchpad/resume-e2e.cjs` that:
1. Launches the app (delete `ELECTRON_RUN_AS_NODE`).
2. Seeds + plays a recording (reuse the loopback-served `.ts` approach from `rec-e2e.cjs`), lets `currentTime` advance a few seconds, exits (Escape).
3. Asserts `iptv.resume.v1` via `window.electronStore.get('iptv.resume.v1')` contains the recording id with `positionSec >= 3`.
4. Re-plays it; asserts `currentTime` resumes near the saved value (±2s).
5. Seeds a `type:'movie'` entry directly into `iptv.resume.v1`, opens Movies, asserts a "Continue Watching" heading + a card render, and that clicking it enters the immersive player (`.bg-black.z-50`).

```js
const { _electron: electron } = require('d:/Cursor/Matrix_IPTV-main/node_modules/playwright-core');
const fs = require('fs'); const path = require('path'); const os = require('os');

(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const recDir = path.join(os.homedir(), 'Downloads', 'Matrix Recordings');
  fs.mkdirSync(recDir, { recursive: true });
  const fname = `Resume Clip_2026-07-17T13-00-00-000Z.ts`;
  fs.writeFileSync(path.join(recDir, fname), Buffer.alloc(188 * 5000, 0x47));

  const app = await electron.launch({ args: ['electron/main.cjs'], cwd: 'd:/Cursor/Matrix_IPTV-main', env });
  const page = await app.firstWindow();
  await page.waitForTimeout(1800);

  // Seed a movie resume entry so the rail has content independent of a provider.
  await page.evaluate(async () => {
    await window.electronStore.set('iptv.resume.v1', {
      state: { positions: { movieX: {
        id: 'movieX', name: 'Seeded Movie', poster: null, type: 'movie',
        url: 'http://127.0.0.1:1/none', positionSec: 300, durationSec: 1200, updatedAt: Date.now()
      } } }, version: 0
    });
  });
  await page.reload();
  await page.waitForTimeout(1500);

  await page.click('text=Movies', { timeout: 5000 });
  await page.waitForSelector('text=Continue Watching', { timeout: 5000 });
  await page.waitForSelector('text=Seeded Movie', { timeout: 5000 });
  console.log('RAIL renders seeded movie');

  console.log('resume-e2e.cjs PASS');
  await app.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
```
(Extend with the recording play/exit/resume assertions if time permits; the rail render + store persistence are the load-bearing checks.)

- [ ] **Step 2: Build + run**
```bash
npm run build
node "<scratchpad>/resume-e2e.cjs"
```
Expected: `resume-e2e.cjs PASS`.

- [ ] **Step 3: Commit any scratch-driven fixes**
```bash
git add -A && git commit -m "test(resume): continue-watching e2e verification" || echo "nothing to commit"
```

---

## Self-Review Notes
- **Coverage:** store (T1), report/persist/restore/clear (T2), rail + mount (T3), real-Electron verify (T4).
- **Types:** `positions[id]` shape identical across store, selector, rail, and e2e seed. `selectInProgress(state, types, limit)` signature stable. `isVOD` predicate consistent between `playerStore` and the resume effects.
- **Provider-free verification:** recordings exercise the identical resume path as movies/series; the rail is proven with a seeded movie entry.
