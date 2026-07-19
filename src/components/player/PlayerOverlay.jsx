import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '../../player/playerStore.js';
import { LucideImageOff, LucideLoader2 } from 'lucide-react';
import { sanitizeText } from '../../lib/security/sanitize.js';
import { getSafeImageUrl } from '../../lib/security/imageSafety.js';

export default function PlayerOverlay() {
  const { activeChannel, playbackState } = usePlayerStore();
  const [visible, setVisible] = useState(false);
  const [displayChannel, setDisplayChannel] = useState(null);

  useEffect(() => {
    if (activeChannel) {
      setDisplayChannel(activeChannel);
      setVisible(true);
      
      // If we're playing, set a timer to hide. If buffering, it stays visible longer.
      let timer;
      if (playbackState === 'playing') {
        timer = setTimeout(() => {
          setVisible(false);
        }, 3000);
      }
      
      return () => {
        if (timer) clearTimeout(timer);
      };
    } else {
      setVisible(false);
    }
  }, [activeChannel, playbackState]);

  if (!displayChannel) return null;

  const safeLogoUrl = getSafeImageUrl(displayChannel.logo);
  const safeName = sanitizeText(displayChannel.name) || 'Unknown Channel';
  const safeGroup = sanitizeText(displayChannel.groups?.[0]) || 'Live';

  return (
    <div 
      className={`absolute inset-0 z-30 pointer-events-none transition-opacity duration-1000 ${
        visible ? 'opacity-100' : 'opacity-0'
      } flex flex-col justify-end p-12 bg-gradient-to-t from-black via-black/60 to-transparent`}
    >
      <div className="flex items-end gap-6 max-w-4xl transform transition-transform duration-700 translate-y-0">
        
        {/* Channel Logo (Premium TV styling) */}
        <div className="w-24 h-24 rounded-2xl bg-[#0a1f22]/80 backdrop-blur-xl border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl shrink-0">
          {safeLogoUrl ? (
            <img 
              src={safeLogoUrl} 
              alt={safeName} 
              className="w-full h-full object-contain p-2" 
              onError={(e) => e.target.style.display = 'none'} 
            />
          ) : (
            <LucideImageOff size={32} className="text-gray-500" />
          )}
        </div>

        {/* Channel Metadata */}
        <div className="flex-1 pb-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2.5 py-0.5 bg-[#E8B15A]/15 text-[#F0C27B] border border-[#E8B15A]/30 text-xs font-bold tracking-widest uppercase rounded">
              {safeGroup}
            </span>
            {(playbackState === 'buffering' || playbackState === 'idle') && (
              <span className="flex items-center gap-2 text-sm text-gray-400 font-medium animate-pulse">
                <LucideLoader2 size={14} className="animate-spin" />
                Tuning...
              </span>
            )}
            {playbackState === 'playing' && (
              <span className="text-sm text-green-400 font-medium flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
                Live
              </span>
            )}
          </div>
          
          <h2 className="text-5xl font-extrabold text-white mb-2 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] tracking-tight">
            {safeName}
          </h2>
          
          <div className="flex items-center gap-2 text-base text-gray-300 font-medium drop-shadow-md">
            <span>HD Stream</span>
            <span className="opacity-50">•</span>
            <span>Matrix Player Engine</span>
          </div>
        </div>

      </div>
    </div>
  );
}
