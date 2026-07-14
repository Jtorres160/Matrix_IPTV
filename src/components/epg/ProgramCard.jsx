import React from 'react';
import { LucidePlayCircle } from 'lucide-react';

export default function ProgramCard({ program, isLive, onClick }) {
  // A program is considered active if it's currently live
  
  return (
    <button
      data-tv-focusable="true"
      onClick={onClick}
      className={`group relative h-20 flex-shrink-0 flex flex-col justify-center px-4 rounded-xl border border-transparent transition-all overflow-hidden focus:outline-none focus:ring-4 focus:ring-blue-500 focus:z-10 text-left bg-white/5 hover:bg-white/10`}
      style={{ width: '280px', marginRight: '8px' }} // Fixed width for simplicity in a streaming UI
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-0 group-focus:opacity-100 transition-opacity" />
      
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
        {program.time}
      </div>
      
      {/* Description overlay on focus */}
      <div className="absolute inset-0 bg-blue-600 opacity-0 group-focus:opacity-100 transition-opacity -z-10 rounded-xl" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-focus:opacity-100 transition-opacity rounded-xl" />
      
      <div className="absolute bottom-2 right-2 opacity-0 group-focus:opacity-100 transition-opacity">
         <LucidePlayCircle size={20} className="text-white" />
      </div>
    </button>
  );
}
