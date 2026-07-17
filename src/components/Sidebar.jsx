import React from 'react';
import { Tv, LayoutList, Film, ListVideo, ListMusic, Settings } from 'lucide-react';

// NOTE: no 'favorites' entry — there is no route for it (favorites live as a
// rail inside Live TV and a category in Channels). A menu item without a
// route renders a blank screen.
const MENU_ITEMS = [
  { id: 'live-tv', label: 'Live TV', icon: Tv },
  { id: 'channels', label: 'Channels', icon: LayoutList },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'series', label: 'Series', icon: ListVideo },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export default function Sidebar({ activeZone, onSelect }) {
  // If the keyboard navigation engine has focus in the 'sidebar' zone, it expands.
  const isExpanded = activeZone === 'sidebar';

  return (
    <>
      <style>{`
        /* Self-contained highly optimized component styles */
        .sidebar-item {
          transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1), background-color 0.2s, border-color 0.2s;
          will-change: transform, background-color, border-color;
          border: 2px solid transparent;
        }
        
        /* 
         * The hardware-accelerated focused state. 
         * Triggered by our useKeyboardNavigation hook dynamically applying '.active-focused' 
         */
        .sidebar-item.active-focused {
          transform: scale(1.05);
          background-color: rgba(255, 255, 255, 0.1);
          border-color: #00e5ff; /* Glowing accent */
          box-shadow: 0 0 20px rgba(0, 229, 255, 0.25);
          z-index: 10;
        }

        .sidebar-item.active-focused .sidebar-icon {
          color: #ffffff !important;
        }

        .sidebar-item.active-focused .sidebar-label {
          color: #ffffff !important;
          font-weight: 700;
        }
      `}</style>

      <div className="hidden md:block">
        <nav 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            paddingTop: '3rem',
            pointerEvents: 'none'
          }}
        >
        {/* 
          Hardware-accelerated background layer.
          We scale the X axis instead of animating width to avoid costly layout reflows on the main thread.
        */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: '260px',
            backgroundColor: 'rgba(15, 15, 20, 0.95)',
            backdropFilter: 'blur(12px)',
            transformOrigin: 'left',
            /* 80px collapsed width / 260px expanded width = ~0.307 */
            transform: isExpanded ? 'scaleX(1)' : 'scaleX(0.3076)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        />

        {/* Interactive Content Container */}
        <div 
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            width: '260px',
            gap: '0.75rem',
            padding: '0 0.5rem',
            pointerEvents: 'auto'
          }}
        >
          {MENU_ITEMS.map((item, index) => (
            <div
              key={item.id}
              className="sidebar-item"
              data-nav-zone="sidebar"
              data-nav-index={index}
              onClick={() => onSelect && onSelect(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '60px',
                borderRadius: '12px',
                cursor: 'pointer'
              }}
            >
              <div 
                style={{
                  width: '64px',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <item.icon 
                  className="sidebar-icon" 
                  size={26} 
                  color="#8a8a93" 
                  style={{ transition: 'color 0.2s ease' }} 
                />
              </div>
              <div 
                className="sidebar-label"
                style={{
                  color: '#8a8a93',
                  fontSize: '1.15rem',
                  whiteSpace: 'nowrap',
                  /* 
                    Translate text in and out smoothly. 
                    Opacity fades it out before it clips outside the scaled background.
                  */
                  transform: isExpanded ? 'translateX(0)' : 'translateX(-15px)',
                  opacity: isExpanded ? 1 : 0,
                  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s',
                  willChange: 'transform, opacity'
                }}
              >
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </nav>
      </div>
    </>
  );
}
