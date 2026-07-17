import { create } from 'zustand';

// Entitlement truth lives in the main process (license:status re-verifies the
// signature on every call). This store only caches the last IPC-verified
// answer — it must never be treated as a trusted flag on its own.
function hasLicenseBridge() {
  return typeof window !== 'undefined' && !!window.electronLicense;
}

export const useEntitlementsStore = create((set, get) => ({
  tier: 'free',
  email: null,
  issued: null,
  hydrated: false,

  refresh: async () => {
    if (!hasLicenseBridge()) { set({ tier: 'free', email: null, issued: null, hydrated: true }); return; }
    try {
      const res = await window.electronLicense.status();
      set({
        tier: res?.tier === 'pro' ? 'pro' : 'free',
        email: res?.email || null,
        issued: res?.issued || null,
        hydrated: true,
      });
    } catch (e) {
      set({ tier: 'free', email: null, issued: null, hydrated: true });
    }
  },

  activate: async (key) => {
    if (!hasLicenseBridge()) return { success: false, error: 'Not available in this build' };
    try {
      const res = await window.electronLicense.activate(key);
      if (res?.success && res?.entitlement) {
        set({ tier: 'pro', email: res.entitlement.email, issued: res.entitlement.issued });
      }
      return res;
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  deactivate: async () => {
    if (!hasLicenseBridge()) return { success: false };
    try {
      const res = await window.electronLicense.deactivate();
      if (res?.success) set({ tier: 'free', email: null, issued: null });
      return res;
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  isPro: () => get().tier === 'pro',
}));
