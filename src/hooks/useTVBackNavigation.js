import { useEffect } from 'react';
import { usePlayerStore } from '../player/playerStore.js';
import { analytics, tvEvents } from '../lib/tv/tvAnalytics.js';
import { isEditableElement } from '../lib/tv/isEditableElement.js';

export function useTVBackNavigation(options = {}) {
  const {
    isModalOpen,
    closeModal,
    isEPGOpen,
    closeEPG,
    onExitTV
  } = options;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditableElement(document.activeElement)) return;

      // Backspace or Escape or 'b' depending on remote mapping
      if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'GoBack') {
        // Prevent default browser back navigation
        e.preventDefault();

        // 1. Close Modal
        if (isModalOpen && closeModal) {
          closeModal();
          return;
        }

        // 2. Close EPG
        if (isEPGOpen && closeEPG) {
          closeEPG();
          return;
        }

        // 3. Exit Channel Overlay (Controls)
        const showControls = usePlayerStore.getState().showControls;
        if (showControls) {
          usePlayerStore.setState({ showControls: false });
          return;
        }

        // 4. Return Focus to Player (if focus is somewhere else)
        if (document.activeElement && document.activeElement !== document.body) {
          document.activeElement.blur();
          return;
        }

        // 5. Exit TV View
        if (onExitTV) {
          onExitTV();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, closeModal, isEPGOpen, closeEPG, onExitTV]);
}
