import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';

// Master scale configuration (px per minute). 
// 8px/min = 240px per 30-minute block. Perfect for TV readability.
const PIXELS_PER_MINUTE = 8;
const ROW_HEIGHT = 80;
const CHANNEL_WIDTH = 260;
// We render 12 hours of timeline (720 minutes).
const TIMELINE_DURATION_MINUTES = 12 * 60; 
const TIMELINE_WIDTH_PX = TIMELINE_DURATION_MINUTES * PIXELS_PER_MINUTE;

/**
 * Highly optimized, memoized row component to prevent React reconciliation
 * overhead during rapid D-pad vertical scrolling.
 */
const ChannelRow = React.memo(({ 
  channel, 
  channelIndex, 
  timelineStart,
  onProgramSelect,
  onChannelSelect
}) => {
  return (
    <div 
      className="epg-row"
      style={{
        display: 'contents' // Crucial: Allows children to participate directly in the parent CSS Grid
      }}
    >
      {/* 
        Y-AXIS: Channel Card (Sticky Left)
        Registers as part of the 'channels' zone for independent vertical navigation. 
      */}
      <div 
        className="channel-card"
        data-nav-zone="channels"
        data-nav-index={channelIndex}
        onClick={() => onChannelSelect && onChannelSelect(channel)}
        style={{
          position: 'sticky',
          left: 0,
          zIndex: 10,
          backgroundColor: '#12121a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          height: `${ROW_HEIGHT}px`,
          cursor: 'pointer',
          willChange: 'background-color',
          gridRow: channelIndex + 2,
          gridColumn: 1
        }}
      >
        <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, width: '45px', flexShrink: 0 }}>
          {channel.number}
        </span>
        {channel.logo ? (
          <img 
            src={channel.logo} 
            alt={channel.name} 
            loading="lazy"
            style={{ width: '48px', height: '48px', objectFit: 'contain', marginRight: '16px', borderRadius: '4px' }} 
          />
        ) : (
          <div style={{ width: '48px', height: '48px', backgroundColor: 'rgba(255,255,255,0.1)', marginRight: '16px', borderRadius: '4px' }} />
        )}
        <span style={{ color: '#ccc', fontSize: '1.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {channel.name}
        </span>
      </div>

      {/* 
        X-AXIS: Programs Timeline
        Relative container defining total width, mapping absolute children
      */}
      <div 
        className="programs-container"
        style={{
          position: 'relative',
          height: `${ROW_HEIGHT}px`,
          width: `${TIMELINE_WIDTH_PX}px`,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          gridRow: channelIndex + 2,
          gridColumn: 2
        }}
      >
        {channel.programs?.map((program, programIndex) => {
          const durationMinutes = (program.endTime - program.startTime) / 60000;
          const offsetMinutes = (program.startTime - timelineStart) / 60000;
          
          const widthPx = durationMinutes * PIXELS_PER_MINUTE;
          const leftPx = offsetMinutes * PIXELS_PER_MINUTE;

          // Optimization: Do not render programs completely outside the 12-hour window
          if (leftPx + widthPx < 0 || leftPx > TIMELINE_WIDTH_PX) return null;

          return (
            <div
              key={program.id || programIndex}
              className="epg-program"
              data-nav-zone="epg"
              data-nav-row={channelIndex}
              data-nav-col={programIndex}
              onClick={() => onProgramSelect && onProgramSelect(program, channel)}
              style={{
                position: 'absolute',
                left: `${leftPx}px`,
                width: `${widthPx}px`,
                height: '100%',
                padding: '10px 16px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                borderRight: '1px solid rgba(10, 10, 15, 0.8)',
                boxSizing: 'border-box',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                willChange: 'background-color, transform, border-color'
              }}
            >
              <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' }}>
                {program.title}
              </div>
              <div style={{ color: '#8a8a93', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                {new Date(program.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(program.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function EPGGrid({ channels = [], onPlayStream }) {
  // Virtualization state
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  useEffect(() => {
    const handleFocusIn = (e) => {
      const navIndex = e.target.getAttribute('data-nav-index');
      if (navIndex !== null) {
        setActiveIndex(parseInt(navIndex, 10));
      }
      const navRow = e.target.getAttribute('data-nav-row');
      if (navRow !== null) {
        setActiveIndex(parseInt(navRow, 10));
      }
    };
    
    const container = containerRef.current;
    if (container) {
      container.addEventListener('focusin', handleFocusIn);
      return () => container.removeEventListener('focusin', handleFocusIn);
    }
  }, []);

  // Memoize the anchor start time (e.g., 2 hours ago from current time)
  const timelineStart = useMemo(() => {
    const now = Date.now();
    // Round to the nearest 30 mins to align the grid cleanly
    const rounded = Math.floor(now / 1800000) * 1800000;
    return rounded - (2 * 60 * 60 * 1000); // Shift anchor back 2 hours
  }, []);

  // Track real-time for the red indicator line
  const [currentTimeOffset, setCurrentTimeOffset] = useState(() => (Date.now() - timelineStart) / 60000);

  useEffect(() => {
    // Throttle the time update to once a minute to prevent micro-renders
    const interval = setInterval(() => {
      setCurrentTimeOffset((Date.now() - timelineStart) / 60000);
    }, 60000);
    return () => clearInterval(interval);
  }, [timelineStart]);

  // Generate timeline headers (every 30 mins)
  const headers = useMemo(() => {
    const blocks = [];
    const totalBlocks = TIMELINE_DURATION_MINUTES / 30; // 24 blocks
    for (let i = 0; i < totalBlocks; i++) {
      const time = new Date(timelineStart + (i * 30 * 60000));
      blocks.push({
        label: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        key: i
      });
    }
    return blocks;
  }, [timelineStart]);

  const handleProgramSelect = useCallback((program, channel) => {
    const now = Date.now();
    
    // Catch-up stream logic
    if (program.endTime < now && channel.catchupAvailable) {
      const startDate = new Date(program.startTime);
      // Format YYYY-MM-DD-HH-MM
      const timeshift = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}-${String(startDate.getHours()).padStart(2, '0')}-${String(startDate.getMinutes()).padStart(2, '0')}`;
      
      const catchupUrl = channel.streamUrl.includes('?') 
        ? `${channel.streamUrl}&timeshift=${timeshift}` 
        : `${channel.streamUrl}?timeshift=${timeshift}`;
        
      onPlayStream && onPlayStream(catchupUrl);
    } 
    // Live stream logic
    else if (program.startTime <= now && program.endTime >= now) {
      onPlayStream && onPlayStream(channel.streamUrl);
    } 
    // Future program details
    else {
      console.log("Details for future program:", program);
    }
  }, [onPlayStream]);

  // Virtualization calculations
  const BUFFER = 5;
  const VISIBLE_ROWS = Math.ceil((typeof window !== 'undefined' ? window.innerHeight : 1080) / ROW_HEIGHT);
  const scrollIndex = Math.floor(scrollTop / ROW_HEIGHT);
  
  // Custom Windowing: Guarantee spatial focus is retained by rendering around both scroll and active index
  const startIndex = Math.max(0, Math.min(scrollIndex, activeIndex) - BUFFER);
  const endIndex = Math.min(channels.length, Math.max(scrollIndex, activeIndex) + VISIBLE_ROWS + BUFFER);
  
  const visibleChannels = useMemo(() => {
    return channels.slice(startIndex, endIndex).map((channel, i) => ({
      channel,
      actualIndex: startIndex + i
    }));
  }, [channels, startIndex, endIndex]);

  return (
    <div 
      className="epg-container"
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#0a0a0f',
        position: 'relative',
        scrollBehavior: 'smooth'
      }}
    >
      <style>{`
        /* Hide scrollbar completely for TV UI */
        .epg-container::-webkit-scrollbar {
          display: none;
        }
        .epg-container {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        
        /* 
         * Hardware-accelerated focus states injected by useKeyboardNavigation
         */
        .channel-card.active-focused {
          background-color: #2a2a3e !important;
          border-left: 4px solid #00e5ff !important;
        }
        .channel-card.active-focused span {
          color: #ffffff !important;
          font-weight: 700;
        }

        .epg-program {
          transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1), background-color 0.2s, border-color 0.2s;
        }
        .epg-program.active-focused {
          background-color: rgba(0, 229, 255, 0.15) !important;
          border: 2px solid #00e5ff !important;
          box-shadow: 0 0 20px rgba(0, 229, 255, 0.3);
          transform: scale(0.97); /* Slight inset scale is safer for Grid neighbors than outward scale */
          z-index: 5;
        }
        .epg-program.active-focused div:first-child {
          color: #00e5ff !important;
          font-weight: 700;
        }
      `}</style>

      {/* Main Grid Wrapper */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: `${CHANNEL_WIDTH}px max-content`,
          gridAutoRows: `${ROW_HEIGHT}px`
        }}
      >
        {/* === TIMELINE HEADER ROW === */}
        <div style={{ display: 'contents' }}>
          {/* Top-Left Empty Anchor Corner */}
          <div 
            style={{
              position: 'sticky',
              top: 0,
              left: 0,
              zIndex: 30,
              backgroundColor: '#12121a',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              borderRight: '1px solid rgba(255,255,255,0.05)'
            }}
          />
          
          {/* Timeline Blocks */}
          <div 
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              backgroundColor: '#12121a',
              display: 'flex',
              width: `${TIMELINE_WIDTH_PX}px`,
              borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            {headers.map((block) => (
              <div 
                key={block.key}
                style={{
                  width: `${30 * PIXELS_PER_MINUTE}px`,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '16px',
                  color: '#8a8a93',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  borderLeft: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                {block.label}
              </div>
            ))}
            
            {/* Real-Time Red Indicator Line */}
            {currentTimeOffset >= 0 && currentTimeOffset <= TIMELINE_DURATION_MINUTES && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  /* Extend indicator height down far enough to cover rows */
                  bottom: `-${channels.length * ROW_HEIGHT}px`, 
                  left: `${currentTimeOffset * PIXELS_PER_MINUTE}px`,
                  width: '2px',
                  backgroundColor: '#ff2a2a',
                  zIndex: 25,
                  pointerEvents: 'none',
                  boxShadow: '0 0 12px rgba(255,42,42,0.6)'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '36px',
                  left: '-4px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#ff2a2a'
                }} />
              </div>
            )}
          </div>
        </div>

        {/* === CHANNEL & PROGRAM ROWS === */}
        {channels.length > 0 && (
          <div style={{ gridRow: channels.length + 1, gridColumn: 1, height: 0 }} />
        )}
        {visibleChannels.map(({ channel, actualIndex }) => (
          <ChannelRow 
            key={channel.id || actualIndex}
            channel={channel}
            channelIndex={actualIndex}
            timelineStart={timelineStart}
            onProgramSelect={handleProgramSelect}
            onChannelSelect={(c) => onPlayStream && onPlayStream(c.streamUrl)}
          />
        ))}
      </div>
    </div>
  );
}
