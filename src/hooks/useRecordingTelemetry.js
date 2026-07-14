// src/hooks/useRecordingTelemetry.js
//
// Principal Performance Hook — Phase 5 Pipeline Integration
//
// Architecture:
//   1. Ref-first accumulation: IPC events write to a mutable Map<streamId, telemetry>
//      that React never observes, avoiding per-event reconciliation.
//   2. rAF-throttled flush: A single requestAnimationFrame loop batch-publishes
//      accumulated telemetry into React state at most once per frame (~16ms).
//   3. Shallow-compare on flush: Only entries whose values actually changed
//      get new object references, enabling React.memo to skip unchanged cards.
//   4. Strict state machine: idle → recording → stopping → idle, with error
//      and paused branches. Invalid transitions are silently rejected.
//   5. Stale-stream detection: If a stream in 'recording' state stops sending
//      progress for STALE_THRESHOLD_MS, it auto-transitions to 'error'.
//   6. Meticulous cleanup: useEffect teardown cancels rAF, invokes the IPC
//      unsubscribe function, and nullifies the accumulator ref.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// --- Constants ---
const STALE_THRESHOLD_MS = 5000; // 5s without progress → assume stream died
const STALE_CHECK_INTERVAL_MS = 2000; // Check for stale streams every 2s

// --- State Machine Definition ---
const VALID_TRANSITIONS = {
  idle:      ['recording'],
  recording: ['stopping', 'error', 'paused'],
  stopping:  ['idle', 'error'],
  paused:    ['recording', 'stopping', 'error'],
  error:     ['idle', 'recording'],
};

function canTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// --- Formatting Utilities ---
export function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clamped = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(k, clamped)).toFixed(2)} ${units[clamped]}`;
}

export function formatElapsedTime(ms) {
  if (ms == null || ms < 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

// --- The Hook ---
export default function useRecordingTelemetry() {
  // ─── React State (rendered) ───
  // Map<streamId, { bytesWritten, elapsedMs, filePath, status, name, lastUpdateTs }>
  const [recordings, setRecordings] = useState({});

  // ─── Mutable Accumulator (never triggers renders) ───
  const accumulatorRef = useRef(new Map());
  const dirtyRef = useRef(false);
  const rafIdRef = useRef(null);
  const isMountedRef = useRef(true);
  const unsubscribeRef = useRef(null);
  const staleIntervalRef = useRef(null);

  // Snapshot ref so callbacks can read current state without stale closures
  const recordingsRef = useRef(recordings);
  recordingsRef.current = recordings;

  // ─── rAF Flush Loop ───
  // Reads the mutable accumulator and publishes to React state if dirty.
  // Uses shallow comparison to preserve object identity for unchanged entries.
  const flushLoop = useCallback(() => {
    if (!isMountedRef.current) return;

    if (dirtyRef.current) {
      dirtyRef.current = false;
      const acc = accumulatorRef.current;
      if (!acc) return;

      setRecordings((prev) => {
        const next = { ...prev };
        let changed = false;

        for (const [streamId, telemetry] of acc.entries()) {
          const existing = prev[streamId];
          // Shallow compare — only create a new object if values differ
          if (
            !existing ||
            existing.bytesWritten !== telemetry.bytesWritten ||
            existing.elapsedMs !== telemetry.elapsedMs ||
            existing.status !== telemetry.status ||
            existing.filePath !== telemetry.filePath
          ) {
            next[streamId] = { ...telemetry };
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }

    rafIdRef.current = requestAnimationFrame(flushLoop);
  }, []);

  // ─── Start Recording ───
  const startRecording = useCallback(async (streamId, url, name) => {
    if (!window.electronRecording) {
      console.error('[Telemetry] electronRecording API not available');
      return { success: false, error: 'Electron API not available' };
    }

    const current = recordingsRef.current[streamId];
    const currentStatus = current?.status || 'idle';

    if (currentStatus === 'recording' || currentStatus === 'stopping') {
      console.warn(`[Telemetry] Stream ${streamId} is already ${currentStatus}`);
      return { success: false, error: `Stream already ${currentStatus}` };
    }

    // Optimistic UI: set to 'recording' immediately
    const initialEntry = {
      bytesWritten: 0,
      elapsedMs: 0,
      filePath: '',
      status: 'recording',
      name: name || streamId,
      lastUpdateTs: Date.now(),
      error: null,
    };

    accumulatorRef.current?.set(streamId, initialEntry);
    dirtyRef.current = true;

    try {
      const result = await window.electronRecording.start(streamId, url, name);
      // Update with the real file path from the backend
      if (result?.filePath && accumulatorRef.current) {
        const entry = accumulatorRef.current.get(streamId);
        if (entry) {
          entry.filePath = result.filePath;
          dirtyRef.current = true;
        }
      }
      return result;
    } catch (err) {
      console.error(`[Telemetry] Failed to start recording ${streamId}:`, err);
      // Transition to error
      if (accumulatorRef.current) {
        const entry = accumulatorRef.current.get(streamId);
        if (entry) {
          entry.status = 'error';
          entry.error = err.message || 'Failed to start';
          dirtyRef.current = true;
        }
      }
      return { success: false, error: err.message };
    }
  }, []);

  // ─── Stop Recording ───
  const stopRecording = useCallback(async (streamId) => {
    if (!window.electronRecording) return { success: false };

    const current = recordingsRef.current[streamId];
    const currentStatus = current?.status || 'idle';

    if (!canTransition(currentStatus, 'stopping')) {
      console.warn(`[Telemetry] Cannot transition ${streamId} from ${currentStatus} to stopping`);
      return { success: false, error: `Invalid transition from ${currentStatus}` };
    }

    // Optimistic transition to 'stopping'
    if (accumulatorRef.current) {
      const entry = accumulatorRef.current.get(streamId);
      if (entry) {
        entry.status = 'stopping';
        dirtyRef.current = true;
      }
    }

    try {
      const result = await window.electronRecording.stop(streamId);
      // Transition to idle (completed)
      if (accumulatorRef.current) {
        const entry = accumulatorRef.current.get(streamId);
        if (entry) {
          entry.status = 'idle';
          dirtyRef.current = true;
        }
      }
      return result;
    } catch (err) {
      console.error(`[Telemetry] Failed to stop recording ${streamId}:`, err);
      if (accumulatorRef.current) {
        const entry = accumulatorRef.current.get(streamId);
        if (entry) {
          entry.status = 'error';
          entry.error = err.message || 'Failed to stop';
          dirtyRef.current = true;
        }
      }
      return { success: false, error: err.message };
    }
  }, []);

  // ─── Dismiss a completed/errored recording from the dashboard ───
  const dismissRecording = useCallback((streamId) => {
    accumulatorRef.current?.delete(streamId);
    setRecordings((prev) => {
      const next = { ...prev };
      delete next[streamId];
      return next;
    });
  }, []);

  // ─── Retry an errored recording ───
  const retryRecording = useCallback(async (streamId, url, name) => {
    const current = recordingsRef.current[streamId];
    if (current?.status !== 'error') return { success: false };
    dismissRecording(streamId);
    return startRecording(streamId, url, name);
  }, [dismissRecording, startRecording]);

  // ─── IPC Subscription + rAF Loop Lifecycle ───
  useEffect(() => {
    isMountedRef.current = true;

    // Start the rAF flush loop
    rafIdRef.current = requestAnimationFrame(flushLoop);

    // Subscribe to IPC progress events
    if (window.electronRecording?.onProgress) {
      unsubscribeRef.current = window.electronRecording.onProgress((data) => {
        // Guard: if unmounted or accumulator destroyed, no-op
        if (!isMountedRef.current || !accumulatorRef.current) return;

        const { streamId, bytesWritten, elapsedMs, filePath } = data;
        const existing = accumulatorRef.current.get(streamId);

        accumulatorRef.current.set(streamId, {
          bytesWritten: bytesWritten ?? 0,
          elapsedMs: elapsedMs ?? 0,
          filePath: filePath ?? existing?.filePath ?? '',
          status: 'recording',
          name: existing?.name ?? streamId,
          lastUpdateTs: Date.now(),
          error: null,
        });

        dirtyRef.current = true;
      });
    }

    // Hydrate initial state from backend on mount
    if (window.electronRecording?.getStatus) {
      window.electronRecording.getStatus().then((statusList) => {
        if (!isMountedRef.current || !accumulatorRef.current) return;
        if (!Array.isArray(statusList) || statusList.length === 0) return;

        for (const item of statusList) {
          accumulatorRef.current.set(item.streamId, {
            bytesWritten: parseFloat(item.sizeMb || 0) * 1024 * 1024,
            elapsedMs: item.startTime ? Date.now() - item.startTime : 0,
            filePath: item.filePath || '',
            status: 'recording',
            name: item.streamId,
            lastUpdateTs: Date.now(),
            error: null,
          });
        }
        dirtyRef.current = true;
      }).catch((err) => {
        console.error('[Telemetry] Failed to hydrate initial status:', err);
      });
    }

    // ─── Stale Stream Detection ───
    // If a stream in 'recording' status hasn't received a progress event
    // in STALE_THRESHOLD_MS, transition it to 'error'.
    staleIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current || !accumulatorRef.current) return;

      const now = Date.now();
      for (const [streamId, entry] of accumulatorRef.current.entries()) {
        if (
          entry.status === 'recording' &&
          entry.lastUpdateTs &&
          now - entry.lastUpdateTs > STALE_THRESHOLD_MS
        ) {
          console.warn(`[Telemetry] Stream ${streamId} is stale — no progress for ${STALE_THRESHOLD_MS}ms`);
          entry.status = 'error';
          entry.error = 'Stream stopped responding';
          dirtyRef.current = true;
        }
      }
    }, STALE_CHECK_INTERVAL_MS);

    // ─── Cleanup ───
    return () => {
      isMountedRef.current = false;

      // Cancel the rAF loop
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      // Unsubscribe from IPC progress events
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Stop stale-stream detection
      if (staleIntervalRef.current != null) {
        clearInterval(staleIntervalRef.current);
        staleIntervalRef.current = null;
      }

      // Release the accumulator Map for GC
      accumulatorRef.current = null;
    };
  }, [flushLoop]);

  // ─── Derived Counts (memoized) ───
  const { activeCount, errorCount, totalCount } = useMemo(() => {
    const entries = Object.values(recordings);
    return {
      activeCount: entries.filter((r) => r.status === 'recording' || r.status === 'paused').length,
      errorCount: entries.filter((r) => r.status === 'error').length,
      totalCount: entries.length,
    };
  }, [recordings]);

  return {
    recordings,
    startRecording,
    stopRecording,
    dismissRecording,
    retryRecording,
    activeCount,
    errorCount,
    totalCount,
    formatBytes,
    formatElapsedTime,
  };
}
