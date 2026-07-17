import React, { useEffect, useRef } from 'react';
import EPGTimeline from './EPGTimeline.jsx';
import EPGChannelRow from './EPGChannelRow.jsx';
import { useTVNavigation } from '../../hooks/useTVNavigation.js';

export default function EPGOverlay({ isOpen, onClose, channels, epgData, onPlayChannel, activeChannel }) {
  const containerRef = useRef(null);

  // Use our TV navigation hook. Close guide on escape.
  useTVNavigation({ 
    isActive: isOpen, 
    onEscape: onClose,
    onGuideOpen: onClose // Pressing G again closes it
  });

  // Focus the guide container or first focusable element when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const firstFocusable = containerRef.current?.querySelector('[data-tv-focusable="true"]');
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  const handleSchedule = (program, channel) => {
    if (!window.electronSchedule || !channel?.url) return;
    window.electronSchedule.add({
      id: `epg-${channel.id}-${program.start}`,
      channelId: String(channel.id),
      channelName: channel.name,
      url: channel.url,
      title: program.title || channel.name,
      startMs: program.start,
      stopMs: program.stop,
    });
  };

  if (!isOpen) return null;

  // Render a subset of channels around the active one, or just the top 50 to avoid DOM bloat in the overlay.
  // A true virtualized list could be used here for massive performance.
  const activeIndex = activeChannel ? channels.findIndex(c => c.id === activeChannel.id) : 0;
  
  // Get window of channels to display
  const startIdx = Math.max(0, activeIndex - 10);
  const endIdx = Math.min(channels.length, startIdx + 30);
  const displayChannels = channels.slice(startIdx, endIdx);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm transition-opacity duration-300">
      
      {/* Top Gradient for text readability */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="p-8 pb-4 flex justify-between items-end relative z-10">
        <div>
          <h2 className="text-3xl font-bold text-white drop-shadow-lg tracking-tight">Live TV Guide</h2>
          <p className="text-gray-300 mt-1 font-medium drop-shadow-md">Press <kbd className="px-2 py-1 bg-white/20 rounded text-sm">ESC</kbd> or <kbd className="px-2 py-1 bg-white/20 rounded text-sm">G</kbd> to close</p>
        </div>
      </div>

      {/* Guide Body */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto no-scrollbar pb-20 relative z-10"
      >
        <EPGTimeline />
        
        <div className="flex flex-col mt-2">
          {displayChannels.map(channel => {
            const programs = epgData.get(channel.tvgId) || [];
            return (
              <EPGChannelRow
                key={channel.id}
                channel={channel}
                programs={programs}
                onPlay={(ch) => {
                  onPlayChannel(ch);
                  onClose();
                }}
                onSchedule={handleSchedule}
              />
            );
          })}
          
          {displayChannels.length === 0 && (
             <div className="flex flex-col items-center justify-center p-20 text-gray-500">
                <p className="text-xl">No channels available for guide.</p>
             </div>
          )}
        </div>
      </div>
      
      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/90 to-transparent pointer-events-none z-20" />
    </div>
  );
}
