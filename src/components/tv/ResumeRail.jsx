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
