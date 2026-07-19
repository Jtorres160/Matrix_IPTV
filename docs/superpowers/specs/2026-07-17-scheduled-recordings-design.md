# EPG-based Scheduled Recordings — Design

**Date:** 2026-07-17
**Branch:** `fix/sqlite-refresh-sync`
**Status:** Approved (design)

## Goal

Let users schedule a recording of a future EPG program ("record later"), firing
the existing recording engine at the program's start and stopping at its end.
Completes the DVR story: record-now (Phase 5) + browse/play (Library) +
**record-later**.

## Non-goals (v1, YAGNI)

- Pre/post padding (record exactly `start`→`stop`).
- Series-wide "record all episodes."
- Overlap/conflict UI (overlaps simply record concurrently).
- OS-level wake-from-closed (see limitation below).

## Key limitation (stated honestly in the UI)

Desktop Electron app with no background OS service — **the app must be running**
at the scheduled time. On launch the scheduler reconciles:
- job window currently open → **start immediately**;
- job window fully in the past (app was closed) → mark **missed** (never lost).
True wake-from-closed needs an OS scheduled task; out of scope for one day.

## Key facts (verified in code)

- `RecordingManager.startRecording(streamId, url, filename)` /
  `stopRecording(streamId)` already exist and write to `Downloads/Matrix
  Recordings/` (captures auto-appear in the Library).
- EPG programs carry `{ title, start, stop }` (epoch ms). Channels carry
  `{ id, name, url, logo }`. Flow: `EPGOverlay` → `EPGChannelRow` (has
  `channel`) → `ProgramCard` (has `program`).
- `RecordingsView` already renders a segmented control (Library / Active).

## Decisions

1. **Scheduler in the main process**, persisted to electron-store
   `iptv.schedules.v1`, so timers fire with the guide closed and survive
   restarts.
2. **Job id doubles as the recording `streamId`** → overlapping schedules record
   concurrently without engine key collisions.
3. **Record affordance on future EPG program cards**; a **"Scheduled" segment**
   in `RecordingsView` lists upcoming + missed jobs with Cancel.
4. Record exactly `start`→`stop` (no padding).

## Architecture

### `electron/scheduler.cjs` (new)
- Job: `{ id, channelId, channelName, url, title, startMs, stopMs, status }`,
  `status ∈ scheduled | recording | completed | missed | canceled`.
- Factory `createScheduler({ store, recordingManager, onUpdate })` →
  `{ init(), add(job), list(), cancel(id) }`.
  - `init()`: load persisted jobs; for each: if `now ≥ stopMs` and not completed
    → `missed`; else if `startMs ≤ now < stopMs` → start now + arm stop; else arm
    start + stop timers.
  - `add(job)`: validate (`stopMs > startMs`, `startMs` in the future or window
    open), persist, arm timers, return the job.
  - `cancel(id)`: clear timers, set `canceled`, persist.
  - Firing start → `recordingManager.startRecording(id, url, title)`, set
    `recording`; firing stop → `stopRecording(id)`, set `completed`; persist +
    `onUpdate(list)` on every transition.
- Pure helper `reconcileJob(job, now)` → next status for a loaded job (unit-tested).

### `electron/main.cjs` (modify)
- Instantiate the scheduler after `recordingManager` + store are ready; call
  `init()` on app ready; push updates to the renderer via
  `mainWindow.webContents.send('schedule:update', list)`.
- IPC: `schedule:add`, `schedule:list`, `schedule:cancel`.

### `electron/preload.cjs` (modify)
- `window.electronSchedule = { add, list, cancel, onUpdate }`.

### Renderer
- **`ProgramCard.jsx`** — accept `onSchedule`; when `program.start > Date.now()`
  and the channel has a `url`, show a record icon button (on focus) that calls
  `onSchedule(program)`.
- **`EPGChannelRow.jsx` / `EPGOverlay.jsx`** — thread
  `onSchedule(program, channel)` down; `EPGOverlay` builds the job and calls
  `window.electronSchedule.add`.
- **`ScheduledList.jsx`** (new) — reads `electronSchedule.list()` + subscribes to
  `onUpdate`; renders upcoming (with countdown) and missed jobs; Cancel button.
- **`RecordingsView.jsx`** — add a third **"Scheduled"** segment →
  `<ScheduledList />`.

## Error handling
- `add` with `stopMs ≤ startMs` or fully-past window → rejected with a reason.
- `startRecording` failure at fire time → job `missed` (not `completed`).
- electron-store unavailable → scheduler still runs in memory for the session.

## Testing (real Electron, provider-free)
1. Seed a channel whose `url` targets a local byte-streaming server.
2. `schedule:add` a job `startMs = now+2s`, `stopMs = now+5s`; assert a real
   `.ts` lands in `Matrix Recordings/` and status goes
   `scheduled → recording → completed`.
3. `schedule:cancel` a future job → timers disarmed, status `canceled`.
4. Load a past-window job → `reconcileJob` yields `missed`.
Plus a `node` unit test for `reconcileJob` transitions.

## New dependencies
None.
