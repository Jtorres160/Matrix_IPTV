import { useEffect, useState, useRef } from 'react';

/**
 * TV D-Pad Keyboard Navigation Hook
 * 
 * Manages spatial focus shifting between UI zones and handles remote simulation
 * using Arrow keys, Enter, and Escape/Backspace.
 * 
 * @param {Object} options Configuration parameters
 * @param {string} options.initialZone Starting interactive zone (e.g., 'channels')
 * @param {Object} options.zonesConfig Custom transition mappings and zone types
 * @param {Function} [options.onEnter] Callback triggered when Enter is pressed
 * @param {Function} [options.onBack] Callback triggered when Escape/Backspace is pressed
 */
export default function useKeyboardNavigation({
  initialZone = 'channels',
  zonesConfig = {},
  onEnter = null,
  onBack = null
}) {
  const [activeZone, setActiveZone] = useState(initialZone);
  // Store focus coordinates/indices per zone (to preserve cursor memory)
  const [focusStates, setFocusStates] = useState({});

  const activeZoneRef = useRef(activeZone);
  const focusStatesRef = useRef(focusStates);

  useEffect(() => {
    activeZoneRef.current = activeZone;
  }, [activeZone]);

  useEffect(() => {
    focusStatesRef.current = focusStates;
  }, [focusStates]);

  /**
   * Helper to retrieve focus details for a specific zone
   */
  const getZoneFocus = (zone) => {
    const state = focusStatesRef.current[zone];
    if (state === undefined) {
      return { index: 0, row: 0, col: 0 };
    }
    return state;
  };

  /**
   * Updates focus index/coordinates for a zone
   */
  const setZoneFocus = (zone, updates) => {
    setFocusStates(prev => {
      const current = prev[zone] || { index: 0, row: 0, col: 0 };
      return {
        ...prev,
        [zone]: { ...current, ...updates }
      };
    });
  };

  /**
   * Public function to manually transition/override active zones
   */
  const setZone = (zoneName) => {
    if (zoneName) {
      setActiveZone(zoneName);
    }
  };

  useEffect(() => {
    const updateDOMFocus = () => {
      const zone = activeZoneRef.current;
      const focus = getZoneFocus(zone);
      const config = zonesConfig[zone] || {};

      // Remove the focus class from all elements in the DOM
      document.querySelectorAll('.active-focused').forEach(el => {
        el.classList.remove('active-focused');
      });

      // Find the element in the DOM
      let target;
      if (config.type === 'grid') {
        target = document.querySelector(
          `[data-nav-zone="${zone}"][data-nav-row="${focus.row}"][data-nav-col="${focus.col}"]`
        );
        // Fallback search if exact grid coordinates fail due to dynamic rows
        if (!target) {
          target = document.querySelector(`[data-nav-zone="${zone}"]`);
        }
      } else {
        target = document.querySelector(
          `[data-nav-zone="${zone}"][data-nav-index="${focus.index}"]`
        );
      }

      if (target) {
        target.classList.add('active-focused');
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
        
        if (target.focus) {
          target.focus();
        }
      }
    };

    const handleKeyDown = (e) => {
      const zoneName = activeZoneRef.current;
      const config = zonesConfig[zoneName] || {};
      
      // Query elements belonging to this active zone
      const elements = Array.from(
        document.querySelectorAll(`[data-nav-zone="${zoneName}"]`)
      );

      if (elements.length === 0) return;

      // Sort elements to ensure predictable keyboard focus indexing
      if (config.type === 'grid') {
        elements.sort((a, b) => {
          const rowA = parseInt(a.getAttribute('data-nav-row') || '0', 10);
          const rowB = parseInt(b.getAttribute('data-nav-row') || '0', 10);
          if (rowA !== rowB) return rowA - rowB;
          const colA = parseInt(a.getAttribute('data-nav-col') || '0', 10);
          const colB = parseInt(b.getAttribute('data-nav-col') || '0', 10);
          return colA - colB;
        });
      } else {
        elements.sort((a, b) => {
          const idxA = parseInt(a.getAttribute('data-nav-index') || '0', 10);
          const idxB = parseInt(b.getAttribute('data-nav-index') || '0', 10);
          return idxA - idxB;
        });
      }

      const focus = getZoneFocus(zoneName);
      let handled = false;

      const isVertical = config.type === 'vertical' || !config.type;
      const isHorizontal = config.type === 'horizontal';
      const isGrid = config.type === 'grid';

      if (e.key === 'ArrowUp') {
        handled = true;
        if (isVertical) {
          const nextIdx = focus.index > 0 ? focus.index - 1 : (config.up === 'wrap' ? elements.length - 1 : 0);
          setZoneFocus(zoneName, { index: nextIdx });
        } else if (isGrid) {
          // Move up a row
          const nextRow = focus.row > 0 ? focus.row - 1 : 0;
          // Check if elements exist in the target row, fallback if col counts differ
          const match = elements.find(el => 
            parseInt(el.getAttribute('data-nav-row') || '0', 10) === nextRow &&
            parseInt(el.getAttribute('data-nav-col') || '0', 10) === focus.col
          );
          if (match) {
            setZoneFocus(zoneName, { row: nextRow });
          } else if (config.up && config.up !== 'wrap') {
            setActiveZone(config.up);
          }
        } else if (config.up) {
          setActiveZone(config.up);
        }
      } else if (e.key === 'ArrowDown') {
        handled = true;
        if (isVertical) {
          const nextIdx = focus.index < elements.length - 1 ? focus.index + 1 : (config.down === 'wrap' ? 0 : focus.index);
          setZoneFocus(zoneName, { index: nextIdx });
        } else if (isGrid) {
          // Move down a row
          const maxRow = Math.max(...elements.map(el => parseInt(el.getAttribute('data-nav-row') || '0', 10)));
          const nextRow = focus.row < maxRow ? focus.row + 1 : focus.row;
          const match = elements.find(el => 
            parseInt(el.getAttribute('data-nav-row') || '0', 10) === nextRow &&
            parseInt(el.getAttribute('data-nav-col') || '0', 10) === focus.col
          );
          if (match) {
            setZoneFocus(zoneName, { row: nextRow });
          } else if (config.down && config.down !== 'wrap') {
            setActiveZone(config.down);
          }
        } else if (config.down) {
          setActiveZone(config.down);
        }
      } else if (e.key === 'ArrowLeft') {
        handled = true;
        if (isHorizontal) {
          const nextIdx = focus.index > 0 ? focus.index - 1 : (config.left === 'wrap' ? elements.length - 1 : 0);
          setZoneFocus(zoneName, { index: nextIdx });
        } else if (isGrid) {
          // Move left a column
          if (focus.col > 0) {
            setZoneFocus(zoneName, { col: focus.col - 1 });
          } else if (config.left) {
            setActiveZone(config.left);
          }
        } else if (config.left) {
          setActiveZone(config.left);
        }
      } else if (e.key === 'ArrowRight') {
        handled = true;
        if (isHorizontal) {
          const nextIdx = focus.index < elements.length - 1 ? focus.index + 1 : (config.right === 'wrap' ? 0 : focus.index);
          setZoneFocus(zoneName, { index: nextIdx });
        } else if (isGrid) {
          // Move right a column
          const maxCol = Math.max(...elements.map(el => parseInt(el.getAttribute('data-nav-col') || '0', 10)));
          if (focus.col < maxCol) {
            setZoneFocus(zoneName, { col: focus.col + 1 });
          } else if (config.right) {
            setActiveZone(config.right);
          }
        } else if (config.right) {
          setActiveZone(config.right);
        }
      } else if (e.key === 'Enter') {
        handled = true;
        let targetEl;
        if (isGrid) {
          targetEl = document.querySelector(
            `[data-nav-zone="${zoneName}"][data-nav-row="${focus.row}"][data-nav-col="${focus.col}"]`
          );
        } else {
          targetEl = document.querySelector(
            `[data-nav-zone="${zoneName}"][data-nav-index="${focus.index}"]`
          );
        }

        if (targetEl) {
          targetEl.click();
          if (onEnter) {
            const index = isGrid ? null : focus.index;
            onEnter(zoneName, index, targetEl);
          }
        }
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        handled = true;
        if (onBack) {
          onBack(zoneName);
        } else if (config.back) {
          setActiveZone(config.back);
        }
      }

      if (handled) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Apply focus layout rules on render
    const rafId = requestAnimationFrame(updateDOMFocus);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(rafId);
    };
  }, [activeZone, focusStates, zonesConfig, onEnter, onBack]);

  // Extract simple index or grid coordinate based on current active config
  const activeFocusState = getZoneFocus(activeZone);
  const activeConfig = zonesConfig[activeZone] || {};
  const focusedIndex = activeConfig.type === 'grid' 
    ? { row: activeFocusState.row, col: activeFocusState.col }
    : activeFocusState.index;

  return {
    activeZone,
    focusedIndex,
    setZone,
    focusStates,
    setZoneFocus
  };
}
