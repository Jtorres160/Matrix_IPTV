import { useEffect, useCallback } from 'react';

/**
 * Lightweight custom focus manager for TV-like spatial navigation.
 * Uses bounding boxes to find the nearest focusable element in the specified direction.
 */
export function useTVNavigation({ onGuideOpen, onEscape, isActive = true }) {
  
  const handleKeyDown = useCallback((e) => {
    if (!isActive) return;

    // Ignore if user is typing in an input or textarea
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) {
      return;
    }

    const key = e.key.toLowerCase();
    
    // Custom triggers
    if (key === 'g' && onGuideOpen) {
      e.preventDefault();
      onGuideOpen();
      return;
    }
    
    if (key === 'escape' && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }

    const directionMap = {
      'arrowup': 'UP',
      'arrowdown': 'DOWN',
      'arrowleft': 'LEFT',
      'arrowright': 'RIGHT'
    };

    const direction = directionMap[key];
    if (!direction) return;

    // Only prevent default for arrow keys when not in an input, to avoid scrolling the page
    e.preventDefault();

    const focusableSelector = '[data-tv-focusable="true"]:not([disabled])';
    const focusableElements = Array.from(document.querySelectorAll(focusableSelector));
    
    if (focusableElements.length === 0) return;

    const currentFocused = document.activeElement;
    const isCurrentFocusable = currentFocused && currentFocused.matches(focusableSelector);

    if (!isCurrentFocusable) {
      // Focus the first available element if nothing is focused
      focusableElements[0].focus();
      return;
    }

    const currentRect = currentFocused.getBoundingClientRect();
    let bestMatch = null;
    let minDistance = Infinity;

    focusableElements.forEach(el => {
      if (el === currentFocused) return;
      
      const rect = el.getBoundingClientRect();
      // Skip elements that are not visible (display: none or 0 width/height)
      if (rect.width === 0 || rect.height === 0) return;
      
      let isValidDirection = false;
      let primaryDist = 0;
      let secondaryDist = 0;
      
      // Calculate distances based on direction
      if (direction === 'UP' && rect.bottom <= currentRect.top) {
        isValidDirection = true;
        primaryDist = currentRect.top - rect.bottom;
        // Calculate center overlap
        secondaryDist = Math.abs((currentRect.left + currentRect.width/2) - (rect.left + rect.width/2));
      } 
      else if (direction === 'DOWN' && rect.top >= currentRect.bottom) {
        isValidDirection = true;
        primaryDist = rect.top - currentRect.bottom;
        secondaryDist = Math.abs((currentRect.left + currentRect.width/2) - (rect.left + rect.width/2));
      }
      else if (direction === 'LEFT' && rect.right <= currentRect.left) {
        isValidDirection = true;
        primaryDist = currentRect.left - rect.right;
        secondaryDist = Math.abs((currentRect.top + currentRect.height/2) - (rect.top + rect.height/2));
      }
      else if (direction === 'RIGHT' && rect.left >= currentRect.right) {
        isValidDirection = true;
        primaryDist = rect.left - currentRect.right;
        secondaryDist = Math.abs((currentRect.top + currentRect.height/2) - (rect.top + rect.height/2));
      }

      if (isValidDirection) {
        // Weigh primary distance heavily, secondary distance (alignment) less
        const distance = primaryDist + (secondaryDist * 2);
        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = el;
        }
      }
    });

    if (bestMatch) {
      bestMatch.focus();
    }

  }, [isActive, onGuideOpen, onEscape]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
