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
