import React from 'react';
import { LucidePlayCircle, LucideCircle } from 'lucide-react';
import { formatTime } from '../../lib/epg/epgTime.js';

export default function ProgramCard({ program, isLive, onClick, onSchedule }) {
  // Prefer human clock times from the parsed start/stop; fall back to the
  // legacy raw string only if this program predates the parsed-time EPG.
  const timeLabel = (program.start != null && program.stop != null)
    ? `${formatTime(program.start)} - ${formatTime(program.stop)}`
    : program.time;
  const isFuture = program.start != null && program.start > Date.now();

  return (
    <div className="relative flex-shrink-0" style={{ width: '280px', marginRight: '8px' }}>
      <button
        data-tv-focusable="true"
        onClick={onClick}
        className="u-focus group relative h-20 w-full flex flex-col justify-center px-4 rounded-xl border border-transparent overflow-hidden focus:z-10 text-left bg-white/5 hover:bg-white/10"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#E8B15A]/0 via-[#E8B15A]/60 to-[#E8B15A]/0 opacity-0 group-focus:opacity-100 transition-opacity" />

        <div className="flex justify-between items-start w-full">
          <h4 className={`text-sm font-bold truncate pr-2 ${isLive ? 'text-white' : 'text-gray-300'} group-focus:text-white`}>
            {program.title || 'Unknown Program'}
          </h4>
          {isLive && (
            <span className="px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-bold tracking-wider uppercase rounded shadow-sm shrink-0">
              Live
            </span>
          )}
        </div>

        <div className="text-xs text-gray-500 mt-1 truncate">
          {timeLabel}
        </div>

        {/* Description overlay on focus */}
        <div className="absolute inset-0 bg-[#E8B15A]/25 opacity-0 group-focus:opacity-100 transition-opacity -z-10 rounded-xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-focus:opacity-100 transition-opacity rounded-xl" />

        <div className="absolute bottom-2 right-2 opacity-0 group-focus:opacity-100 transition-opacity">
          <LucidePlayCircle size={20} className="text-white" />
        </div>
      </button>

      {/* Record affordance — only for future programs (a <button> can't nest) */}
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
