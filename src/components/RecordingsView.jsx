import React, { useState, useEffect } from 'react';
import RecordingLibrary from './RecordingLibrary.jsx';
import RecordingDashboard from './RecordingDashboard.jsx';
import ScheduledList from './ScheduledList.jsx';
import UpsellModal from './UpsellModal.jsx';
import { useEntitlementsStore } from '../store/entitlementsStore.js';
import { LucideLock } from 'lucide-react';

const SEGMENTS = [
  { id: 'library', label: 'Library' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'active', label: 'Active' },
];

export default function RecordingsView() {
  const [segment, setSegment] = useState('library');
  const isPro = useEntitlementsStore((s) => s.isPro());
  const hydrated = useEntitlementsStore((s) => s.hydrated);
  const [upsellOpen, setUpsellOpen] = useState(false);

  // Only auto-open the upsell once we've confirmed (post-hydration) the user
  // is actually free — otherwise a Pro user gets greeted by this modal
  // during the brief pre-hydration window where isPro() still reads false.
  useEffect(() => {
    if (hydrated && !isPro) setUpsellOpen(true);
  }, [hydrated, isPro]);

  // Before the first refresh() resolves we don't yet know the real tier —
  // render nothing rather than assuming free and flashing the locked screen.
  if (!hydrated) return null;

  if (!isPro) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-12">
        <LucideLock size={48} className="text-amber-400 mb-6" />
        <div className="text-xl font-bold text-slate-200 mb-2">Recordings is a Matrix Pro feature</div>
        <div className="text-sm text-slate-500 max-w-sm mb-6">Unlock DVR recording, scheduled recordings, and your Recordings library.</div>
        <button
          onClick={() => setUpsellOpen(true)}
          className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold focus:outline-none"
        >
          Unlock Matrix Pro
        </button>
        <UpsellModal
          open={upsellOpen}
          onClose={() => setUpsellOpen(false)}
          reason="Recordings is a Matrix Pro feature."
        />
      </div>
    );
  }

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
        {segment === 'library' ? <RecordingLibrary />
          : segment === 'scheduled' ? <ScheduledList />
          : <RecordingDashboard />}
      </div>
    </div>
  );
}
