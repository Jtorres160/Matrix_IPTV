import React, { useEffect, useRef } from 'react';
import { useProfilesStore } from '../store/profileStore';

export default function SettingsPanel({ onClose }) {
  const activeProfile = useProfilesStore((s) => s.getActiveProfile());
  const updateSettings = useProfilesStore((s) => s.updateSettings);

  const settings = activeProfile?.settings || {
    epgScale: 'normal',
    colorOverlay: 'semi-transparent',
    channelColumnWidth: 300,
  };

  const firstControlRef = useRef(null);

  useEffect(() => {
    if (firstControlRef.current) {
      firstControlRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e, action) => {
    if (e.key === 'Backspace' || e.key === 'Escape') {
      if (onClose) onClose();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Enter') {
      if (action) {
        action(e.key);
      }
    }
  };

  const toggleScale = (key) => {
    const scales = ['compact', 'normal', 'large'];
    const idx = scales.indexOf(settings.epgScale);
    let nextIdx = idx;
    if (key === 'ArrowRight' || key === 'Enter') nextIdx = (idx + 1) % scales.length;
    if (key === 'ArrowLeft') nextIdx = (idx - 1 + scales.length) % scales.length;
    updateSettings({ epgScale: scales[nextIdx] });
  };

  const toggleOverlay = (key) => {
    const overlays = ['solid', 'semi-transparent', 'transparent'];
    const idx = overlays.indexOf(settings.colorOverlay);
    let nextIdx = idx;
    if (key === 'ArrowRight' || key === 'Enter') nextIdx = (idx + 1) % overlays.length;
    if (key === 'ArrowLeft') nextIdx = (idx - 1 + overlays.length) % overlays.length;
    updateSettings({ colorOverlay: overlays[nextIdx] });
  };

  const adjustWidth = (key) => {
    let width = settings.channelColumnWidth;
    if (key === 'ArrowRight') width = Math.min(width + 50, 500);
    if (key === 'ArrowLeft') width = Math.max(width - 50, 200);
    if (key === 'Enter') width = width >= 500 ? 200 : width + 50;
    updateSettings({ channelColumnWidth: width });
  };

  return (
    <div style={styles.drawerOverlay} onClick={onClose}>
      <div 
        style={styles.drawer} 
        data-nav-zone="settings" 
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={styles.header}>Personalization</h2>
        
        <div style={styles.settingsList}>
          
          <div style={styles.settingGroup}>
            <div style={styles.settingLabel}>EPG Grid Scale</div>
            <button
              ref={firstControlRef}
              style={styles.settingButton}
              className="nav-item"
              data-nav-id="setting-scale"
              onKeyDown={(e) => handleKeyDown(e, toggleScale)}
              onClick={() => toggleScale('Enter')}
            >
              {settings.epgScale.toUpperCase()}
            </button>
            <div style={styles.hint}>Use L/R to adjust</div>
          </div>

          <div style={styles.settingGroup}>
            <div style={styles.settingLabel}>Color Overlay Theme</div>
            <button
              style={styles.settingButton}
              className="nav-item"
              data-nav-id="setting-overlay"
              onKeyDown={(e) => handleKeyDown(e, toggleOverlay)}
              onClick={() => toggleOverlay('Enter')}
            >
              {settings.colorOverlay.toUpperCase()}
            </button>
            <div style={styles.hint}>Use L/R to adjust</div>
          </div>

          <div style={styles.settingGroup}>
            <div style={styles.settingLabel}>Channel Column Width</div>
            <button
              style={styles.settingButton}
              className="nav-item"
              data-nav-id="setting-width"
              onKeyDown={(e) => handleKeyDown(e, adjustWidth)}
              onClick={() => adjustWidth('Enter')}
            >
              {settings.channelColumnWidth}px
            </button>
            <div style={styles.hint}>Use L/R to adjust width</div>
          </div>

        </div>
      </div>
    </div>
  );
}

const styles = {
  drawerOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 9999,
  },
  drawer: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: '350px',
    backgroundColor: '#1a1a1a',
    boxShadow: '-5px 0 25px rgba(0,0,0,0.8)',
    borderLeft: '1px solid #333',
    padding: '30px',
    display: 'flex',
    flexDirection: 'column',
    color: '#fff',
    animation: 'slideInRight 0.2s ease-out forwards',
  },
  header: {
    margin: '0 0 30px 0',
    fontSize: '24px',
    fontWeight: 'bold',
    borderBottom: '2px solid #333',
    paddingBottom: '10px',
  },
  settingsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '25px',
  },
  settingGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  settingLabel: {
    fontSize: '16px',
    color: '#aaa',
  },
  settingButton: {
    backgroundColor: '#333',
    border: '2px solid transparent',
    color: '#fff',
    padding: '15px 20px',
    fontSize: '18px',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    outline: 'none',
    transition: 'all 0.2s',
  },
  hint: {
    fontSize: '12px',
    color: '#666',
    marginTop: '2px',
  },
};

// Assuming you have this somewhere globally, or we can just let React handle inline styles without the actual CSS keyframes here, but keyframes would require actual CSS.
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
`;
document.head.appendChild(styleSheet);
