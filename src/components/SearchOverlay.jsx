import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProfilesStore } from '../store/profileStore';

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '_', 'BACKSPACE'],
  ['SPACE', 'CLEAR']
];

export default function SearchOverlay({ onClose }) {
  const activePlaylistId = useProfilesStore((s) => s.activePlaylistId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Focus management ref to auto-focus the first key when opened
  const firstKeyRef = useRef(null);

  useEffect(() => {
    if (firstKeyRef.current) {
      firstKeyRef.current.focus();
    }
  }, []);

  // Fetch results whenever query changes
  useEffect(() => {
    if (!activePlaylistId) return;
    
    if (query.trim() === '') {
      setResults([]);
      return;
    }

    let isMounted = true;
    setIsSearching(true);

    const fetchResults = async () => {
      try {
        // @ts-ignore
        const { channels } = await window.electronDB.searchChannels(activePlaylistId, query, 50, 0);
        if (isMounted) {
          setResults(channels);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        if (isMounted) setIsSearching(false);
      }
    };

    // Very slight debounce for fast typers
    const timer = setTimeout(fetchResults, 100);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query, activePlaylistId]);

  const handleKeyPress = useCallback((key) => {
    if (key === 'BACKSPACE') {
      setQuery((q) => q.slice(0, -1));
    } else if (key === 'CLEAR') {
      setQuery('');
    } else if (key === 'SPACE') {
      setQuery((q) => q + ' ');
    } else {
      setQuery((q) => q + key);
    }
  }, []);

  const handleKeyDown = (e, keyType, value) => {
    if (e.key === 'Enter') {
      if (keyType === 'keyboard') {
        handleKeyPress(value);
      } else if (keyType === 'channel') {
        // Play the channel - you'd likely dispatch an event or state update here
        console.log('Play channel:', value);
        if (onClose) onClose();
      }
    } else if (e.key === 'Backspace' || e.key === 'Escape') {
      if (onClose) onClose();
    }
  };

  return (
    <div style={styles.overlay} data-nav-zone="search-overlay">
      <div style={styles.container}>
        {/* Left Side: Keyboard */}
        <div style={styles.keyboardSection} data-nav-zone="keyboard">
          <div style={styles.queryDisplay}>
            {query || 'Type to search...'}
          </div>
          
          <div style={styles.keyboardGrid}>
            {KEYBOARD_ROWS.map((row, rowIndex) => (
              <div key={rowIndex} style={styles.keyboardRow}>
                {row.map((key, colIndex) => {
                  const isFirst = rowIndex === 0 && colIndex === 0;
                  const isSpecial = key.length > 1;
                  return (
                    <button
                      key={key}
                      ref={isFirst ? firstKeyRef : null}
                      style={{ ...styles.keyBtn, width: isSpecial ? 'auto' : '50px', flex: isSpecial ? 1 : 'none' }}
                      className="nav-item"
                      data-nav-id={`key-${key}`}
                      onClick={() => handleKeyPress(key)}
                      onKeyDown={(e) => handleKeyDown(e, 'keyboard', key)}
                    >
                      {key === 'BACKSPACE' ? '⌫' : key}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Results */}
        <div style={styles.resultsSection} data-nav-zone="search-results">
          <h2 style={styles.resultsHeader}>Results ({results.length})</h2>
          
          {isSearching && results.length === 0 && (
            <div style={styles.statusMsg}>Searching...</div>
          )}
          
          {!isSearching && query && results.length === 0 && (
            <div style={styles.statusMsg}>No channels found for "{query}"</div>
          )}

          <div style={styles.resultsList}>
            {results.map((channel, index) => (
              <div
                key={channel.id}
                style={styles.channelItem}
                className="nav-item"
                data-nav-id={`search-result-${channel.id}`}
                tabIndex={0}
                onKeyDown={(e) => handleKeyDown(e, 'channel', channel)}
                onClick={() => {
                  console.log('Play channel:', channel);
                  if (onClose) onClose();
                }}
              >
                {channel.logo ? (
                  <img src={channel.logo} alt={channel.name} style={styles.channelLogo} />
                ) : (
                  <div style={styles.placeholderLogo} />
                )}
                <div style={styles.channelInfo}>
                  <div style={styles.channelName}>{channel.name}</div>
                  <div style={styles.channelGroup}>{channel.group_title || 'Uncategorized'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 9999,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#fff',
    backdropFilter: 'blur(10px)',
  },
  container: {
    width: '80%',
    height: '80%',
    display: 'flex',
    flexDirection: 'row',
    gap: '40px',
    backgroundColor: '#1a1a1a',
    borderRadius: '16px',
    padding: '30px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    border: '1px solid #333',
  },
  keyboardSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  queryDisplay: {
    backgroundColor: '#2a2a2a',
    padding: '20px',
    fontSize: '28px',
    borderRadius: '12px',
    minHeight: '40px',
    border: '2px solid #444',
    fontFamily: 'monospace',
    letterSpacing: '1px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  keyboardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  keyboardRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: '10px',
  },
  keyBtn: {
    height: '50px',
    backgroundColor: '#333',
    border: '2px solid transparent',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '20px',
    cursor: 'pointer',
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    transition: 'all 0.2s',
  },
  resultsSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#111',
    borderRadius: '12px',
    padding: '20px',
    overflow: 'hidden',
  },
  resultsHeader: {
    margin: '0 0 15px 0',
    fontSize: '20px',
    color: '#aaa',
    borderBottom: '1px solid #333',
    paddingBottom: '10px',
  },
  statusMsg: {
    color: '#777',
    fontStyle: 'italic',
    padding: '20px 0',
  },
  resultsList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingRight: '10px',
  },
  channelItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#222',
    borderRadius: '8px',
    cursor: 'pointer',
    outline: 'none',
    border: '2px solid transparent',
    transition: 'all 0.2s',
  },
  channelLogo: {
    width: '60px',
    height: '40px',
    objectFit: 'contain',
    marginRight: '15px',
    backgroundColor: '#000',
    borderRadius: '4px',
  },
  placeholderLogo: {
    width: '60px',
    height: '40px',
    marginRight: '15px',
    backgroundColor: '#333',
    borderRadius: '4px',
  },
  channelInfo: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  channelName: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  channelGroup: {
    fontSize: '14px',
    color: '#888',
  },
};
