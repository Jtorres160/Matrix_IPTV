import React, { useState } from 'react';
import RecordingLibrary from './RecordingLibrary.jsx';
import RecordingDashboard from './RecordingDashboard.jsx';
import ScheduledList from './ScheduledList.jsx';

const SEGMENTS = [
  { id: 'library', label: 'Library' },
  { id: 'scheduled', label: 'Scheduled' },
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
        {segment === 'library' ? <RecordingLibrary />
          : segment === 'scheduled' ? <ScheduledList />
          : <RecordingDashboard />}
      </div>
    </div>
  );
}
