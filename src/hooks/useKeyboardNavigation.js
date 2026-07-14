import { useEffect, useState, useRef } from 'react';

/**
 * TV D-Pad Focus Simulation Hook
 * 
 * Supports:
 * - ArrowUp / ArrowDown for vertical list navigation
 * - ArrowLeft / ArrowRight for horizontal list or zone transitions
 * - Enter to trigger clicks on focused items
 * - Escape / Backspace to go back to previous zones
 * - Scroll-into-view to ensure focused item is always visible
 * 
 * Elements registers by using HTML attributes:
 * - `data-nav-zone` matches the zone name (e.g. 'sidebar')
 * - `data-nav-index` 0-indexed number representing list order
 * - `data-nav-row` (optional) row number for grid layouts
 * - `data-nav-col` (optional) column number for grid layouts
 * 
 * @param {string} currentZone The active zone string
 * @param {Function} setCurrentZone State setter for the active zone
 * @param {Object} zonesConfig Mapping of transitions and types for each zone
 * @returns {Object} { focusIndices, setFocusIndex, getFocusIndex }
 */
export default function useKeyboardNavigation(currentZone, setCurrentZone, zonesConfig = {}) {
  // Store the active index for each zone to preserve state when switching zones
  const [focusIndices, setFocusIndices] = useState({});
  
  const currentZoneRef = useRef(currentZone);
  const focusIndicesRef = useRef(focusIndices);

  useEffect(() => {
    currentZoneRef.current = currentZone;
  }, [currentZone]);

  useEffect(() => {
    focusIndicesRef.current = focusIndices;
  }, [focusIndices]);

  const getFocusIndex = (zone) => {
    return focusIndicesRef.current[zone] ?? 0;
  };

  const setFocusIndex = (zone, index) => {
    setFocusIndices(prev => ({ ...prev, [zone]: index }));
  };

  useEffect(() => {
    const updateDOMFocus = () => {
      const zone = currentZoneRef.current;
      const index = getFocusIndex(zone);

      // Remove class from all elements
      document.querySelectorAll('.active-focused').forEach(el => {
        el.classList.remove('active-focused');
      });

      // Find the target element in the active zone
      const target = document.querySelector(
        `[data-nav-zone="${zone}"][data-nav-index="${index}"]`
      );

      if (target) {
        target.classList.add('active-focused');
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
        
        // Also focus HTML element for accessibility and native key handling
        if (target.focus) {
          target.focus();
        }
      }
    };

    const handleKeyDown = (e) => {
      const zoneName = currentZoneRef.current;
      const config = zonesConfig[zoneName] || {};
      
      // Query all focusable items in the active zone and sort them
      const elements = Array.from(
        document.querySelectorAll(`[data-nav-zone="${zoneName}"]`)
      ).sort((a, b) => {
        const idxA = parseInt(a.getAttribute('data-nav-index') || '0', 10);
        const idxB = parseInt(b.getAttribute('data-nav-index') || '0', 10);
        return idxA - idxB;
      });

      if (elements.length === 0) return;

      const currentIndex = getFocusIndex(zoneName);
      
      // Keep index within bounds
      let safeIndex = currentIndex;
      if (safeIndex >= elements.length) {
        safeIndex = elements.length - 1;
      }
      if (safeIndex < 0) {
        safeIndex = 0;
      }

      let nextIndex = safeIndex;
      let handled = false;

      const isVertical = config.type === 'vertical' || !config.type;
      const isHorizontal = config.type === 'horizontal';
      const isGrid = config.type === 'grid';

      if (e.key === 'ArrowUp') {
        handled = true;
        if (isVertical) {
          if (safeIndex > 0) {
            nextIndex = safeIndex - 1;
          } else if (config.up === 'wrap') {
            nextIndex = elements.length - 1;
          }
        } else if (isGrid) {
          // Go up a row in the 2D grid
          const currentEl = elements[safeIndex];
          const curRow = parseInt(currentEl.getAttribute('data-nav-row') || '0', 10);
          const curCol = parseInt(currentEl.getAttribute('data-nav-col') || '0', 10);
          
          const target = elements.find(el => {
            const r = parseInt(el.getAttribute('data-nav-row') || '0', 10);
            const c = parseInt(el.getAttribute('data-nav-col') || '0', 10);
            return r === curRow - 1 && c === curCol;
          });
          if (target) {
            nextIndex = elements.indexOf(target);
          } else if (config.up && config.up !== 'wrap') {
            setCurrentZone(config.up);
          }
        } else if (config.up) {
          setCurrentZone(config.up);
        }
      } else if (e.key === 'ArrowDown') {
        handled = true;
        if (isVertical) {
          if (safeIndex < elements.length - 1) {
            nextIndex = safeIndex + 1;
          } else if (config.down === 'wrap') {
            nextIndex = 0;
          }
        } else if (isGrid) {
          // Go down a row in the 2D grid
          const currentEl = elements[safeIndex];
          const curRow = parseInt(currentEl.getAttribute('data-nav-row') || '0', 10);
          const curCol = parseInt(currentEl.getAttribute('data-nav-col') || '0', 10);
          
          const target = elements.find(el => {
            const r = parseInt(el.getAttribute('data-nav-row') || '0', 10);
            const c = parseInt(el.getAttribute('data-nav-col') || '0', 10);
            return r === curRow + 1 && c === curCol;
          });
          if (target) {
            nextIndex = elements.indexOf(target);
          } else if (config.down && config.down !== 'wrap') {
            setCurrentZone(config.down);
          }
        } else if (config.down) {
          setCurrentZone(config.down);
        }
      } else if (e.key === 'ArrowLeft') {
        handled = true;
        if (isHorizontal) {
          if (safeIndex > 0) {
            nextIndex = safeIndex - 1;
          } else if (config.left === 'wrap') {
            nextIndex = elements.length - 1;
          }
        } else if (isGrid) {
          // Go left a column in the 2D grid
          const currentEl = elements[safeIndex];
          const curRow = parseInt(currentEl.getAttribute('data-nav-row') || '0', 10);
          const curCol = parseInt(currentEl.getAttribute('data-nav-col') || '0', 10);
          
          const target = elements.find(el => {
            const r = parseInt(el.getAttribute('data-nav-row') || '0', 10);
            const c = parseInt(el.getAttribute('data-nav-col') || '0', 10);
            return r === curRow && c === curCol - 1;
          });
          if (target) {
            nextIndex = elements.indexOf(target);
          } else if (config.left && config.left !== 'wrap') {
            setCurrentZone(config.left);
          }
        } else if (config.left) {
          setCurrentZone(config.left);
        }
      } else if (e.key === 'ArrowRight') {
        handled = true;
        if (isHorizontal) {
          if (safeIndex < elements.length - 1) {
            nextIndex = safeIndex + 1;
          } else if (config.right === 'wrap') {
            nextIndex = 0;
          }
        } else if (isGrid) {
          // Go right a column in the 2D grid
          const currentEl = elements[safeIndex];
          const curRow = parseInt(currentEl.getAttribute('data-nav-row') || '0', 10);
          const curCol = parseInt(currentEl.getAttribute('data-nav-col') || '0', 10);
          
          const target = elements.find(el => {
            const r = parseInt(el.getAttribute('data-nav-row') || '0', 10);
            const c = parseInt(el.getAttribute('data-nav-col') || '0', 10);
            return r === curRow && c === curCol + 1;
          });
          if (target) {
            nextIndex = elements.indexOf(target);
          } else if (config.right && config.right !== 'wrap') {
            setCurrentZone(config.right);
          }
        } else if (config.right) {
          setCurrentZone(config.right);
        }
      } else if (e.key === 'Enter') {
        handled = true;
        const currentEl = elements[safeIndex];
        if (currentEl) {
          // Emulate mouse click
          currentEl.click();
        }
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        handled = true;
        if (config.back) {
          setCurrentZone(config.back);
        }
      }

      if (handled) {
        e.preventDefault();
      }

      if (nextIndex !== safeIndex) {
        setFocusIndex(zoneName, nextIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Delay DOM focus search to ensure React has completed rendering the elements
    const rafId = requestAnimationFrame(updateDOMFocus);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(rafId);
    };
  }, [currentZone, focusIndices, zonesConfig]);

  return {
    focusIndices,
    setFocusIndex,
    getFocusIndex
  };
}
