import React, { useState } from 'react';
import { LucideX, LucideLock, LucideCheck } from 'lucide-react';
import { useEntitlementsStore } from '../store/entitlementsStore.js';
import { PAYMENT_URL } from '../config/pro.js';

const BENEFITS = [
  'Record any live channel instantly',
  'Schedule recordings from the TV Guide',
  'Browse and play your Recordings library',
  'Add unlimited sources (M3U, Xtream, Stalker)',
];

export default function UpsellModal({ open, onClose, reason }) {
  const activate = useEntitlementsStore((s) => s.activate);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleActivate = async () => {
    if (!key.trim() || busy) return;
    setBusy(true);
    setStatus({ type: '', msg: '' });
    try {
      const res = await activate(key.trim());
      if (res?.success) {
        setStatus({ type: 'success', msg: 'Matrix Pro activated. Enjoy!' });
        setTimeout(onClose, 1200);
      } else {
        setStatus({ type: 'error', msg: res?.error || 'That key was not accepted.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGetPro = () => {
    if (window.electronApp?.openExternal) window.electronApp.openExternal(PAYMENT_URL);
    else window.open(PAYMENT_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-md u-glass rounded-2xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <LucideLock size={20} className="text-[#E8B15A]" />
              <h2 className="text-xl font-bold text-white">Matrix Pro</h2>
            </div>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded-lg focus:outline-none">
              <LucideX size={20} />
            </button>
          </div>

          {reason && <p className="text-sm text-[#F0C27B]/90 mb-4">{reason}</p>}

          <ul className="space-y-2 mb-6">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-gray-200">
                <LucideCheck size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                {b}
              </li>
            ))}
          </ul>

          <button
            onClick={handleGetPro}
            className="u-focus w-full mb-4 py-2.5 rounded-lg u-pill-active font-semibold"
          >
            Get Matrix Pro
          </button>

          <div className="border-t border-gray-700 pt-4">
            <div className="text-sm text-gray-400 mb-2">Already purchased? Activate your license:</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
                placeholder="Paste your license key"
                className="flex-1 bg-black/40 border border-[var(--hairline)] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B6B73] focus:outline-none focus:ring-2 focus:ring-[#E8B15A]/70"
              />
              <button
                onClick={handleActivate}
                disabled={busy}
                className="px-4 py-2 rounded-lg u-pill-active disabled:opacity-50 text-sm font-semibold focus:outline-none"
              >
                Activate
              </button>
            </div>
            {status.msg && (
              <p className={`text-xs mt-2 ${status.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{status.msg}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
