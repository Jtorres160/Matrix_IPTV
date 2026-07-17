# EPG-based Scheduled Recordings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Schedule recordings of future EPG programs; a main-process scheduler fires the existing recording engine at start/stop.

**Architecture:** `electron/scheduler.cjs` persists jobs to electron-store `iptv.schedules.v1`, arms setTimeout timers, reconciles on launch, and drives `RecordingManager`. Renderer adds a record button on future EPG program cards and a "Scheduled" segment in `RecordingsView`.

**Tech Stack:** Electron 31 (CJS main/preload), React 18, existing `RecordingManager`, playwright-core (verification).

## Global Constraints

- Scheduler lives in the **main process**; app must be running for a timer to fire (no OS wake). On launch: open-window jobs start now; fully-past jobs → `missed`.
- Persistence key `iptv.schedules.v1` via electron-store (main uses the `store` object already in `main.cjs`).
- Job id **is** the recording `streamId` (unique → concurrent schedules are safe).
- Job shape: `{ id, channelId, channelName, url, title, startMs, stopMs, status }`, `status ∈ scheduled|recording|completed|missed|canceled`.
- Verify by driving real Electron (`_electron.launch`, delete `ELECTRON_RUN_AS_NODE`). Provider-free: seed a channel URL that points at a local byte-streaming server.
- Scratchpad for temp scripts; require project modules by absolute path.

---

## Task 1: reconcileJob pure helper + scheduler skeleton

**Files:** Create `electron/scheduler.cjs`; Test `scratchpad/sched-reconcile.test.cjs`

**Interfaces produced:**
- `reconcileJob(job, now)` → one of `'missed'|'start-now'|'arm'|'done'`:
  - `completed`/`canceled`/`missed` job → `'done'` (leave as-is).
  - `now >= stopMs` → `'missed'`.
  - `startMs <= now < stopMs` → `'start-now'`.
  - `now < startMs` → `'arm'`.
- `createScheduler({ store, recordingManager, onUpdate })` → `{ init, add, list, cancel }` (implemented across Tasks 1–2).

- [ ] **Step 1: Write the failing test**

Create `scratchpad/sched-reconcile.test.cjs`:
```js
const assert = require('assert');
const { reconcileJob } = require('d:/Cursor/Matrix_IPTV-main/electron/scheduler.cjs');

const now = 1_000_000;
assert.strictEqual(reconcileJob({ status: 'scheduled', startMs: now + 100, stopMs: now + 200 }, now), 'arm');
assert.strictEqual(reconcileJob({ status: 'scheduled', startMs: now - 50, stopMs: now + 200 }, now), 'start-now');
assert.strictEqual(reconcileJob({ status: 'scheduled', startMs: now - 200, stopMs: now - 50 }, now), 'missed');
assert.strictEqual(reconcileJob({ status: 'completed', startMs: now - 200, stopMs: now - 50 }, now), 'done');
assert.strictEqual(reconcileJob({ status: 'canceled', startMs: now + 100, stopMs: now + 200 }, now), 'done');
assert.strictEqual(reconcileJob({ status: 'missed', startMs: now - 200, stopMs: now - 50 }, now), 'done');
console.log('sched-reconcile.test.cjs PASS');
```

- [ ] **Step 2: Run — expect FAIL** (module missing).

- [ ] **Step 3: Implement skeleton**

Create `electron/scheduler.cjs`:
```js
// electron/scheduler.cjs
// Main-process EPG scheduled-recording engine. Persists jobs, arms timers,
// reconciles on launch, and drives the existing RecordingManager.
const STORE_KEY = 'iptv.schedules.v1';

// Decide what to do with a loaded job at time `now`.
function reconcileJob(job, now) {
  if (job.status === 'completed' || job.status === 'canceled' || job.status === 'missed') return 'done';
  if (now >= job.stopMs) return 'missed';
  if (job.startMs <= now && now < job.stopMs) return 'start-now';
  return 'arm';
}

function createScheduler({ store, recordingManager, onUpdate }) {
  const timers = new Map(); // id -> { startT, stopT }

  function loadJobs() {
    try { return store.get(STORE_KEY) || []; } catch (e) { return []; }
  }
  function saveJobs(jobs) {
    try { store.set(STORE_KEY, jobs); } catch (e) { /* in-memory only */ }
    if (onUpdate) onUpdate(jobs);
  }
  function getJob(jobs, id) { return jobs.find((j) => j.id === id); }

  function setStatus(id, status) {
    const jobs = loadJobs();
    const job = getJob(jobs, id);
    if (!job) return;
    job.status = status;
    saveJobs(jobs);
  }

  function clearTimers(id) {
    const t = timers.get(id);
    if (t) { clearTimeout(t.startT); clearTimeout(t.stopT); timers.delete(id); }
  }

  async function fireStart(job) {
    try {
      await recordingManager.startRecording(job.id, job.url, job.title || job.channelName || 'recording');
      setStatus(job.id, 'recording');
    } catch (e) {
      setStatus(job.id, 'missed');
    }
  }
  async function fireStop(job) {
    try { await recordingManager.stopRecording(job.id); } catch (e) { /* ignore */ }
    setStatus(job.id, 'completed');
    clearTimers(job.id);
  }

  function arm(job) {
    const now = Date.now();
    const startT = setTimeout(() => fireStart(job), Math.max(0, job.startMs - now));
    const stopT = setTimeout(() => fireStop(job), Math.max(0, job.stopMs - now));
    timers.set(job.id, { startT, stopT });
  }

  function armOrRun(job) {
    const decision = reconcileJob(job, Date.now());
    if (decision === 'arm') { arm(job); }
    else if (decision === 'start-now') { fireStart(job); const stopT = setTimeout(() => fireStop(job), Math.max(0, job.stopMs - Date.now())); timers.set(job.id, { startT: null, stopT }); }
    else if (decision === 'missed') { job.status = 'missed'; }
  }

  return {
    init() {
      const jobs = loadJobs();
      for (const job of jobs) armOrRun(job);
      saveJobs(jobs); // persists any missed transitions + notifies renderer
    },
    add(job) {
      if (!job || !job.url || !(job.stopMs > job.startMs)) {
        return { success: false, error: 'Invalid schedule (need url and stop > start)' };
      }
      if (Date.now() >= job.stopMs) {
        return { success: false, error: 'That program has already ended' };
      }
      const jobs = loadJobs();
      const record = { ...job, status: 'scheduled' };
      jobs.push(record);
      saveJobs(jobs);
      armOrRun(record);
      // armOrRun may have flipped status; persist again.
      saveJobs(loadJobs());
      return { success: true, job: record };
    },
    list() { return loadJobs(); },
    cancel(id) {
      clearTimers(id);
      const jobs = loadJobs();
      const job = getJob(jobs, id);
      if (job && (job.status === 'scheduled' || job.status === 'recording')) {
        if (job.status === 'recording') { try { recordingManager.stopRecording(id); } catch (e) {} }
        job.status = 'canceled';
        saveJobs(jobs);
      }
      return { success: true };
    },
  };
}

module.exports = { reconcileJob, createScheduler, STORE_KEY };
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**
```bash
git add electron/scheduler.cjs
git commit -m "feat(dvr): scheduled-recording engine (reconcile + timers)"
```

---

## Task 2: Wire scheduler into main + preload

**Files:** Modify `electron/main.cjs`, `electron/preload.cjs`; Test `scratchpad/sched-ipc.cjs`

**Interfaces produced (renderer `window.electronSchedule`):**
- `add(job): Promise<{success, job?, error?}>`, `list(): Promise<Job[]>`, `cancel(id): Promise<{success}>`, `onUpdate(cb): () => void`.

- [ ] **Step 1: Require + instantiate in main.cjs**

Near the recordings requires in `electron/main.cjs`:
```js
const { createScheduler } = require('./scheduler.cjs');
let scheduler = null;
```

- [ ] **Step 2: Create scheduler once store + recordingManager exist**

In `electron/main.cjs`, after `const recordingManager = new RecordingManager();` add:
```js
function ensureScheduler() {
  if (scheduler) return scheduler;
  scheduler = createScheduler({
    store,
    recordingManager,
    onUpdate: (jobs) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('schedule:update', jobs);
    },
  });
  return scheduler;
}
```
(`store` is the electron-store instance already initialized in `main.cjs`; if it's lazily created via `initStore()`, call `await initStore()` before `ensureScheduler()` in the ready handler.)

- [ ] **Step 3: Init on app ready**

In the `app.whenReady().then(async () => { ... })` block, after the recordings server starts:
```js
  try {
    if (!store) await initStore();
    ensureScheduler().init();
  } catch (e) {
    logger.error('[Scheduler] init failed', e);
  }
```

- [ ] **Step 4: IPC handlers**

After the recording IPC handlers in `electron/main.cjs`:
```js
ipcMain.handle('schedule:add', async (event, job) => ensureScheduler().add(job));
ipcMain.handle('schedule:list', async () => ensureScheduler().list());
ipcMain.handle('schedule:cancel', async (event, id) => ensureScheduler().cancel(id));
```

- [ ] **Step 5: Expose in preload.cjs**

Add to `electron/preload.cjs`:
```js
contextBridge.exposeInMainWorld('electronSchedule', {
  add: (job) => ipcRenderer.invoke('schedule:add', job),
  list: () => ipcRenderer.invoke('schedule:list'),
  cancel: (id) => ipcRenderer.invoke('schedule:cancel', id),
  onUpdate: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('schedule:update', sub);
    return () => ipcRenderer.removeListener('schedule:update', sub);
  },
});
```

- [ ] **Step 6: Drive test — schedule fires a real recording**

Create `scratchpad/sched-ipc.cjs`:
```js
const { _electron: electron } = require('d:/Cursor/Matrix_IPTV-main/node_modules/playwright-core');
const fs = require('fs'); const path = require('path'); const os = require('os'); const http = require('http');

(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;

  // Local stream server: responds 200 and streams bytes slowly.
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'video/mp2t' });
    const iv = setInterval(() => res.write(Buffer.alloc(1024, 0x47)), 100);
    req.on('close', () => clearInterval(iv));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/live.ts`;

  const recDir = path.join(os.homedir(), 'Downloads', 'Matrix Recordings');
  const before = new Set(fs.existsSync(recDir) ? fs.readdirSync(recDir) : []);

  const app = await electron.launch({ args: ['electron/main.cjs'], cwd: 'd:/Cursor/Matrix_IPTV-main', env });
  const page = await app.firstWindow();
  await page.waitForTimeout(1500);

  const now = Date.now();
  const res = await page.evaluate((u) => window.electronSchedule.add({
    id: 'job-test-1', channelId: 'c1', channelName: 'Test Ch', url: u, title: 'Sched Probe',
    startMs: Date.now() + 1500, stopMs: Date.now() + 4000,
  }), url);
  console.log('ADD:', JSON.stringify(res));
  if (!res.success) throw new Error('add failed');

  await page.waitForTimeout(6000); // let start+stop fire

  const list = await page.evaluate(() => window.electronSchedule.list());
  const job = list.find((j) => j.id === 'job-test-1');
  console.log('STATUS:', job && job.status);
  if (!job || job.status !== 'completed') throw new Error('job did not complete');

  const after = fs.readdirSync(recDir).filter((f) => !before.has(f) && f.endsWith('.ts'));
  console.log('NEW FILES:', after);
  if (after.length === 0) throw new Error('no .ts written');

  console.log('sched-ipc.cjs PASS');
  await app.close(); srv.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
```

- [ ] **Step 7: Build + run**
```bash
npm run build
node "<scratchpad>/sched-ipc.cjs"
```
Expected: `sched-ipc.cjs PASS` (status `completed`, a new `.ts` present).

- [ ] **Step 8: Commit**
```bash
git add electron/main.cjs electron/preload.cjs
git commit -m "feat(dvr): schedule IPC + main-process wiring"
```

---

## Task 3: Record button on future EPG programs

**Files:** Modify `src/components/epg/ProgramCard.jsx`, `src/components/epg/EPGChannelRow.jsx`, `src/components/epg/EPGOverlay.jsx`

**Interfaces consumed:** `window.electronSchedule.add` (Task 2).

- [ ] **Step 1: ProgramCard — record affordance for future programs**

In `src/components/epg/ProgramCard.jsx`, change the signature to accept `onSchedule` and add a record button. Replace the component signature and add the button before the closing `</button>`... but a `<button>` cannot nest a `<button>`. Instead wrap the card in a relative container and render the record control as a sibling overlay. Replace the returned JSX root:
```jsx
export default function ProgramCard({ program, isLive, onClick, onSchedule }) {
  const timeLabel = (program.start != null && program.stop != null)
    ? `${formatTime(program.start)} - ${formatTime(program.stop)}`
    : program.time;
  const isFuture = program.start != null && program.start > Date.now();

  return (
    <div className="relative flex-shrink-0" style={{ width: '280px', marginRight: '8px' }}>
      <button
        data-tv-focusable="true"
        onClick={onClick}
        className="group relative h-20 w-full flex flex-col justify-center px-4 rounded-xl border border-transparent transition-all overflow-hidden focus:outline-none focus:ring-4 focus:ring-blue-500 focus:z-10 text-left bg-white/5 hover:bg-white/10"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-0 group-focus:opacity-100 transition-opacity" />
        <div className="flex justify-between items-start w-full">
          <h4 className={`text-sm font-bold truncate pr-2 ${isLive ? 'text-white' : 'text-gray-300'} group-focus:text-white`}>
            {program.title || 'Unknown Program'}
          </h4>
          {isLive && (
            <span className="px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-bold tracking-wider uppercase rounded shadow-sm shrink-0">Live</span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1 truncate">{timeLabel}</div>
        <div className="absolute inset-0 bg-blue-600 opacity-0 group-focus:opacity-100 transition-opacity -z-10 rounded-xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-focus:opacity-100 transition-opacity rounded-xl" />
      </button>
      {isFuture && onSchedule && (
        <button
          data-tv-focusable="true"
          onClick={(e) => { e.stopPropagation(); onSchedule(program); }}
          title="Record this program"
          className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 text-red-300 border border-red-500/40 text-[10px] font-bold uppercase tracking-wide hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          <LucideCircle size={10} className="fill-red-500 text-red-500" /> Rec
        </button>
      )}
    </div>
  );
}
```
Update the import line to include `LucideCircle`:
```jsx
import { LucidePlayCircle, LucideCircle } from 'lucide-react';
```

- [ ] **Step 2: EPGChannelRow — thread onSchedule with the channel**

In `src/components/epg/EPGChannelRow.jsx`, change the signature to `({ channel, programs, onPlay, onSchedule })` and pass to ProgramCard:
```jsx
            <ProgramCard
              key={i}
              program={prog}
              isLive={i === 0}
              onClick={() => onPlay(channel)}
              onSchedule={onSchedule ? (program) => onSchedule(program, channel) : undefined}
            />
```

- [ ] **Step 3: EPGOverlay — build the job and call the scheduler**

In `src/components/epg/EPGOverlay.jsx`, add a handler and pass it to each row:
```jsx
  const handleSchedule = (program, channel) => {
    if (!window.electronSchedule || !channel?.url) return;
    window.electronSchedule.add({
      id: `epg-${channel.id}-${program.start}`,
      channelId: String(channel.id),
      channelName: channel.name,
      url: channel.url,
      title: program.title || channel.name,
      startMs: program.start,
      stopMs: program.stop,
    });
  };
```
And on the `<EPGChannelRow ... onSchedule={handleSchedule} />` usage add the prop.

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/components/epg/ProgramCard.jsx src/components/epg/EPGChannelRow.jsx src/components/epg/EPGOverlay.jsx
git commit -m "feat(dvr): Record button on future EPG programs"
```

---

## Task 4: Scheduled segment in RecordingsView

**Files:** Create `src/components/ScheduledList.jsx`; Modify `src/components/RecordingsView.jsx`

**Interfaces consumed:** `window.electronSchedule.list/cancel/onUpdate` (Task 2).

- [ ] **Step 1: Create ScheduledList.jsx**

Create `src/components/ScheduledList.jsx`:
```jsx
import React, { useEffect, useState, useCallback } from 'react';

const STATUS_STYLE = {
  scheduled: { label: 'Scheduled', color: '#38bdf8' },
  recording: { label: 'Recording', color: '#ef4444' },
  completed: { label: 'Completed', color: '#10b981' },
  missed:    { label: 'Missed',    color: '#f59e0b' },
  canceled:  { label: 'Canceled',  color: '#64748b' },
};

function fmt(ms) { try { return new Date(ms).toLocaleString(); } catch { return ''; } }

export default function ScheduledList() {
  const [jobs, setJobs] = useState([]);

  const refresh = useCallback(async () => {
    if (!window.electronSchedule?.list) { setJobs([]); return; }
    try { setJobs(await window.electronSchedule.list()); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    const off = window.electronSchedule?.onUpdate?.((list) => setJobs(list || []));
    return () => { if (off) off(); };
  }, [refresh]);

  const cancel = useCallback(async (id) => {
    await window.electronSchedule.cancel(id);
    refresh();
  }, [refresh]);

  const sorted = [...jobs].sort((a, b) => a.startMs - b.startMs);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-12">
        <div className="text-6xl mb-6 opacity-40">🗓️</div>
        <div className="text-xl font-bold text-slate-300 mb-2">No Scheduled Recordings</div>
        <div className="text-sm text-slate-500 max-w-sm">Open the TV Guide, focus a future program, and press ● Rec to schedule it.</div>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-3">
      {sorted.map((job) => {
        const st = STATUS_STYLE[job.status] || STATUS_STYLE.scheduled;
        const active = job.status === 'scheduled' || job.status === 'recording';
        return (
          <div key={job.id} className="flex items-center justify-between bg-[#111827] border border-white/10 rounded-xl p-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100 truncate">{job.title || job.channelName}</div>
              <div className="text-xs text-slate-500 mt-1 truncate">{job.channelName} · {fmt(job.startMs)} → {fmt(job.stopMs)}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded" style={{ color: st.color, backgroundColor: `${st.color}22`, border: `1px solid ${st.color}44` }}>{st.label}</span>
              {active && (
                <button onClick={() => cancel(job.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600/15 text-red-300 border border-red-500/30 hover:bg-red-600/25 focus:outline-none">Cancel</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add the Scheduled segment**

In `src/components/RecordingsView.jsx`, add the import and a third segment:
```jsx
import ScheduledList from './ScheduledList.jsx';
```
Extend `SEGMENTS`:
```jsx
const SEGMENTS = [
  { id: 'library', label: 'Library' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'active', label: 'Active' },
];
```
And the body switch:
```jsx
        {segment === 'library' ? <RecordingLibrary />
          : segment === 'scheduled' ? <ScheduledList />
          : <RecordingDashboard />}
```

- [ ] **Step 3: Build**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/components/ScheduledList.jsx src/components/RecordingsView.jsx
git commit -m "feat(dvr): Scheduled segment listing upcoming/missed recordings"
```

---

## Task 5: End-to-end verification (real Electron)

**Files:** Test `scratchpad/sched-e2e.cjs`

- [ ] **Step 1: Drive full lifecycle**

Create `scratchpad/sched-e2e.cjs` that:
1. Starts a local stream server (as in Task 2), launches the app.
2. `schedule:add` a near-future job → waits → asserts status `completed` + a new `.ts` in `Matrix Recordings/`.
3. `schedule:add` a far-future job → `schedule:cancel` → asserts status `canceled`.
4. Opens Recordings → **Scheduled** segment → asserts a row renders.

```js
const { _electron: electron } = require('d:/Cursor/Matrix_IPTV-main/node_modules/playwright-core');
const fs = require('fs'); const path = require('path'); const os = require('os'); const http = require('http');

(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'video/mp2t' });
    const iv = setInterval(() => res.write(Buffer.alloc(1024, 0x47)), 100);
    req.on('close', () => clearInterval(iv));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/live.ts`;
  const recDir = path.join(os.homedir(), 'Downloads', 'Matrix Recordings');
  const before = new Set(fs.existsSync(recDir) ? fs.readdirSync(recDir) : []);

  const app = await electron.launch({ args: ['electron/main.cjs'], cwd: 'd:/Cursor/Matrix_IPTV-main', env });
  const page = await app.firstWindow();
  await page.waitForTimeout(1500);

  const add = await page.evaluate((u) => window.electronSchedule.add({
    id: 'e2e-soon', channelId: 'c1', channelName: 'Ch1', url: u, title: 'E2E Soon',
    startMs: Date.now() + 1500, stopMs: Date.now() + 4000 }), url);
  if (!add.success) throw new Error('add failed');

  await page.evaluate((u) => window.electronSchedule.add({
    id: 'e2e-far', channelId: 'c2', channelName: 'Ch2', url: u, title: 'E2E Far',
    startMs: Date.now() + 3600_000, stopMs: Date.now() + 3660_000 }), url);
  const cancel = await page.evaluate(() => window.electronSchedule.cancel('e2e-far'));
  if (!cancel.success) throw new Error('cancel failed');

  await page.waitForTimeout(6000);
  const list = await page.evaluate(() => window.electronSchedule.list());
  const soon = list.find((j) => j.id === 'e2e-soon');
  const far = list.find((j) => j.id === 'e2e-far');
  console.log('SOON:', soon && soon.status, 'FAR:', far && far.status);
  if (!soon || soon.status !== 'completed') throw new Error('soon not completed');
  if (!far || far.status !== 'canceled') throw new Error('far not canceled');
  const after = fs.readdirSync(recDir).filter((f) => !before.has(f) && f.endsWith('.ts'));
  if (after.length === 0) throw new Error('no .ts written');

  await page.click('text=Recordings', { timeout: 5000 });
  await page.click('text=Scheduled', { timeout: 5000 });
  await page.waitForSelector('text=E2E Soon', { timeout: 5000 });
  console.log('Scheduled segment renders row');

  console.log('sched-e2e.cjs PASS');
  await app.close(); srv.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
```

- [ ] **Step 2: Build + run**
```bash
npm run build
node "<scratchpad>/sched-e2e.cjs"
```
Expected: `sched-e2e.cjs PASS`.

- [ ] **Step 3: Commit any fixes**
```bash
git add -A && git commit -m "test(dvr): scheduled-recordings e2e verification" || echo "nothing to commit"
```

---

## Self-Review Notes
- **Coverage:** reconcile + engine (T1), main/IPC/preload (T2), EPG record button (T3), Scheduled UI (T4), e2e (T5). All spec sections mapped.
- **Types:** Job shape identical across scheduler, IPC, `ScheduledList`, and e2e seeds. `reconcileJob` return set `{arm,start-now,missed,done}` used consistently. Job id == recording streamId everywhere.
- **Limitation honored:** launch reconciliation marks past jobs `missed` (T1 `init`/`reconcileJob`); UI shows Missed status (T4).
- **Provider-free verification:** local stream server + `schedule:add`, no Xtream needed.
```
