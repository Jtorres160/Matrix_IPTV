import React, { useEffect } from 'react';

export default function GlobalLoader({ isLoading }) {
  useEffect(() => {
    const blockKeys = (e) => {
      if (isLoading) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    if (isLoading) {
      window.addEventListener('keydown', blockKeys, true);
    }

    return () => {
      window.removeEventListener('keydown', blockKeys, true);
    };
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div 
      className="absolute inset-0 z-[25] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      style={{
        animation: 'fade-in 0.3s ease-out forwards'
      }}
    >
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#00e5ff] border-t-transparent rounded-full animate-spin"></div>
        <span className="text-white text-lg font-semibold tracking-wider">Loading...</span>
      </div>
    </div>
  );
}
