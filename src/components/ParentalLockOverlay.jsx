import React, { useState, useEffect } from 'react';
import { useProfilesStore } from '../store/profileStore';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';

const KEYS = [
  { label: '1', row: 0, col: 0 }, { label: '2', row: 0, col: 1 }, { label: '3', row: 0, col: 2 },
  { label: '4', row: 1, col: 0 }, { label: '5', row: 1, col: 1 }, { label: '6', row: 1, col: 2 },
  { label: '7', row: 2, col: 0 }, { label: '8', row: 2, col: 1 }, { label: '9', row: 2, col: 2 },
  { label: 'CLR', row: 3, col: 0 }, { label: '0', row: 3, col: 1 }, { label: 'DEL', row: 3, col: 2 },
];

export default function ParentalLockOverlay({ onUnlock, onCancel, mode: explicitMode }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  
  const activeSettings = useProfilesStore(s => s.getActiveSettings());
  const hasPin = Boolean(activeSettings?.parentalPin);
  const mode = explicitMode || (hasPin ? 'verify' : 'setup');
  
  const verifyParentalPin = useProfilesStore(s => s.verifyParentalPin);
  const setParentalPin = useProfilesStore(s => s.setParentalPin);
  const isParentalUnlocked = useProfilesStore(s => s.isParentalUnlocked);
  
  const handleKeyPress = (keyLabel) => {
    setError('');
    if (keyLabel === 'CLR') {
      setPin('');
    } else if (keyLabel === 'DEL') {
      setPin(prev => prev.slice(0, -1));
    } else {
      if (pin.length < 4) {
        setPin(prev => prev + keyLabel);
      }
    }
  };

  const submitPin = async (currentPin) => {
    if (currentPin.length !== 4) return;
    
    if (mode === 'setup') {
      await setParentalPin(currentPin);
      onUnlock && onUnlock(true);
    } else {
      const isValid = await verifyParentalPin(currentPin);
      if (isValid) {
        onUnlock && onUnlock(true);
      } else {
        setError('Incorrect PIN. Try again.');
        setPin('');
      }
    }
  };

  // Submit automatically when 4 digits are entered
  useEffect(() => {
    if (pin.length === 4) {
      submitPin(pin);
    }
  }, [pin]);

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if focused on an input elsewhere (though overlay covers everything)
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleKeyPress('DEL');
      } else if (e.key === 'Escape') {
        onCancel && onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin]);

  // Setup D-pad navigation
  useKeyboardNavigation({
    initialZone: 'parental-lock',
    zonesConfig: {
      'parental-lock': {
        type: 'grid'
      }
    },
    onEnter: () => {
      // Find the active focused element and click it
      const activeEl = document.querySelector('.active-focused');
      if (activeEl) {
        activeEl.click();
      }
    },
    onBack: () => {
      onCancel && onCancel();
    }
  });

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(10, 10, 15, 0.95)', zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <style>{`
        .pin-key {
          transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1), background-color 0.2s, box-shadow 0.2s;
        }
        .pin-key.active-focused {
          background-color: #E8B15A !important;
          color: #141310 !important;
          transform: scale(1.1);
          box-shadow: 0 0 24px rgba(232, 177, 90, 0.45);
          z-index: 10;
        }
      `}</style>
      
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: '2.5rem', margin: '0 0 1rem 0', fontWeight: 600 }}>
          {mode === 'setup' ? 'Create Parental PIN' : 'Enter Parental PIN'}
        </h2>
        <p style={{ color: '#8a8a93', margin: 0, fontSize: '1.2rem' }}>
          {mode === 'setup' ? 'Set a 4-digit PIN to lock specific categories.' : 'This category is locked.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '3rem' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            width: '70px', height: '90px',
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: `2px solid ${pin.length === i ? '#E8B15A' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '3rem', fontWeight: 'bold', color: '#fff',
            transition: 'border-color 0.2s',
            boxShadow: pin.length === i ? '0 0 15px rgba(232,177,90,0.25)' : 'none'
          }}>
            {pin[i] ? '•' : ''}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ color: '#ff2a2a', marginBottom: '2rem', fontSize: '1.2rem', fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1.5rem'
      }}>
        {KEYS.map((k) => (
          <div
            key={k.label}
            className="pin-key"
            data-nav-zone="parental-lock"
            data-nav-row={k.row}
            data-nav-col={k.col}
            onClick={() => handleKeyPress(k.label)}
            style={{
              width: '90px', height: '90px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem', fontWeight: 'bold', color: '#e0e0e0',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            {k.label}
          </div>
        ))}
      </div>
    </div>
  );
}
