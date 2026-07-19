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
            className="group relative bg-[#17171B] border border-[var(--hairline)] rounded-xl overflow-hidden focus-within:border-[#E8B15A]/60"
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
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-[#E8B15A]/15 text-[#F0C27B] border border-[#E8B15A]/30 hover:bg-[#E8B15A]/25 focus:outline-none"
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
