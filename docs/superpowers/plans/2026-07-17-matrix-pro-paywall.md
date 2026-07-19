# Matrix Pro Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gate DVR record-now, Recordings, and 2nd+ source behind an Ed25519-signed offline license key, verified in the main process, with an upsell modal and a Settings license panel. Free tier stays fully usable otherwise.

**Architecture:** `electron/licensing.cjs` exports a pure `verifyLicense(key)`; IPC handlers in `main.cjs` persist an entitlement to electron-store (`iptv.license.v1`) and re-verify on every `status` read. The renderer's `entitlementsStore` caches the last IPC-verified answer (never trusts a client-side flag). Three gate points call `requirePro()` and fall back to `<UpsellModal>`.

**Tech Stack:** Electron 31 (CJS main/preload), Node's built-in `crypto` (Ed25519, no new dependency), React 18 + Zustand, playwright-core (verification).

## Global Constraints

- License key format: `<base64url(payloadJSON)>.<base64url(signature)>`; payload `{ email, issued, tier: 'pro' }`.
- `verifyLicense` is pure — no I/O, never throws, returns `null` on any invalid input.
- Entitlement truth lives in the main process. `license:status` re-verifies the persisted key's signature on every call; a tampered store value is deleted and reported as `free`. The renderer store is a cache, not a source of truth.
- Persistence key `iptv.license.v1` via electron-store (the `store` object already in `main.cjs`, guarded with `if (!store) await initStore();` exactly like `store:get`).
- Free cap = 1 source, enforced client-side in `SourceManagerView.jsx` (stated as a UX gate, not a security boundary).
- `electron/keygen.cjs` and `electron/private-key.pem` must never ship in the packaged app — excluded from `package.json`'s `build.files` and gitignored.
- Verify with real Electron (`_electron.launch`, delete `ELECTRON_RUN_AS_NODE`) where the spec calls for it. Scratchpad for temp scripts; require project modules by absolute path.

---

## Task 1: `verifyLicense` core + `keygen.cjs` tooling

**Files:**
- Create `electron/licensing.cjs`
- Create `electron/keygen.cjs`
- Modify `.gitignore` (add `electron/private-key.pem`)
- Test `scratchpad/verify-license.test.cjs`

**Interfaces produced:**
- `verifyLicense(key: string) → { email: string, issued: number, tier: 'pro' } | null`
- `STORE_KEY = 'iptv.license.v1'`

- [ ] **Step 1: Write the failing test**

Create `scratchpad/verify-license.test.cjs`:
```js
const assert = require('assert');
const crypto = require('crypto');
const { verifyLicense } = require('d:/Cursor/Matrix_IPTV-main/electron/licensing.cjs');

// Sign with a throwaway keypair that does NOT match licensing.cjs's bundled
// public key, to prove a well-formed-but-wrongly-signed key is rejected.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const payload = { email: 'buyer@example.com', issued: Date.now(), tier: 'pro' };
const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
const sig = crypto.sign(null, payloadBuf, privateKey);
const foreignKey = `${payloadBuf.toString('base64url')}.${sig.toString('base64url')}`;

assert.strictEqual(verifyLicense(foreignKey), null, 'key signed by a foreign keypair must be rejected');
assert.strictEqual(verifyLicense('garbage'), null, 'garbage string must be rejected');
assert.strictEqual(verifyLicense(''), null, 'empty string must be rejected');
assert.strictEqual(verifyLicense(null), null, 'null must be rejected');
assert.strictEqual(verifyLicense(`${payloadBuf.toString('base64url')}.${Buffer.from('not-a-sig').toString('base64url')}`), null, 'malformed signature must be rejected');

console.log('verify-license.test.cjs PASS (negative cases)');
```

- [ ] **Step 2: Run — expect FAIL** (module missing).

Run: `node "<scratchpad>/verify-license.test.cjs"`
Expected: `Cannot find module 'd:/Cursor/Matrix_IPTV-main/electron/licensing.cjs'`

- [ ] **Step 3: Implement `licensing.cjs`**

Create `electron/licensing.cjs`:
```js
// electron/licensing.cjs
// Pure Ed25519 license-key verification for Matrix Pro. No I/O, never throws.
const crypto = require('crypto');

const STORE_KEY = 'iptv.license.v1';

// Placeholder — replace with the real public key printed by `keygen.cjs`
// before shipping. Until replaced, every real license key will fail
// verification (safe default: nothing activates by accident).
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
-----END PUBLIC KEY-----
`;

function verifyLicense(key) {
  try {
    if (typeof key !== 'string' || key.length === 0) return null;
    const parts = key.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;

    const payloadBuf = Buffer.from(payloadB64, 'base64url');
    const sigBuf = Buffer.from(sigB64, 'base64url');

    const publicKey = crypto.createPublicKey({ key: PUBLIC_KEY_PEM, format: 'pem' });
    const valid = crypto.verify(null, payloadBuf, publicKey, sigBuf);
    if (!valid) return null;

    const payload = JSON.parse(payloadBuf.toString('utf8'));
    if (!payload || typeof payload.email !== 'string' || typeof payload.issued !== 'number' || payload.tier !== 'pro') {
      return null;
    }
    return { email: payload.email, issued: payload.issued, tier: payload.tier };
  } catch (e) {
    return null;
  }
}

module.exports = { verifyLicense, STORE_KEY, PUBLIC_KEY_PEM };
```

- [ ] **Step 4: Run — expect PASS.**

Run: `node "<scratchpad>/verify-license.test.cjs"`
Expected: `verify-license.test.cjs PASS (negative cases)`

- [ ] **Step 5: Create `keygen.cjs` (dev-only, never bundled)**

Create `electron/keygen.cjs`:
```js
// electron/keygen.cjs
// DEV-ONLY tool. Never bundled (excluded in package.json build.files).
// Run with no args to mint the Ed25519 keypair and print the public key to
// paste into licensing.cjs's PUBLIC_KEY_PEM. Run with an email to mint a
// license key for that buyer using the already-generated private key.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = path.join(__dirname, 'private-key.pem');

function ensureKeypair() {
  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(PRIVATE_KEY_PATH, privatePem, { mode: 0o600 });
  console.log('Generated a new Ed25519 keypair.');
  console.log(`Private key saved to: ${PRIVATE_KEY_PATH} (keep this safe, never commit it)`);
  console.log('\nPaste this into electron/licensing.cjs as PUBLIC_KEY_PEM:\n');
  console.log(publicPem);
  return privatePem;
}

function mintLicense(email) {
  const privatePem = ensureKeypair();
  const privateKey = crypto.createPrivateKey(privatePem);
  const payload = { email, issued: Date.now(), tier: 'pro' };
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = crypto.sign(null, payloadBuf, privateKey);
  const key = `${payloadBuf.toString('base64url')}.${sig.toString('base64url')}`;
  console.log(`\nLicense key for ${email}:\n`);
  console.log(key);
  return key;
}

const email = process.argv[2];
if (!email) {
  ensureKeypair();
  console.log('\nNo email given — keypair ensured only. To mint a license key:');
  console.log('  node electron/keygen.cjs "buyer@example.com"');
} else {
  mintLicense(email);
}
```

- [ ] **Step 6: Gitignore the private key + exclude dev tooling from packaging**

Add to `.gitignore`:
```
electron/private-key.pem
```

In `package.json`, change `build.files` (currently `["dist/**/*", "electron/**/*", "package.json"]`) to exclude the keygen tool and any generated private key from the packaged app:
```json
    "files": [
      "dist/**/*",
      "electron/**/*",
      "!electron/keygen.cjs",
      "!electron/private-key.pem",
      "package.json"
    ],
```

- [ ] **Step 7: Run keygen once, verify a real key round-trips**

Run:
```bash
node electron/keygen.cjs
```
Expected: prints a generated public key PEM. Copy that PEM and replace `PUBLIC_KEY_PEM` in `electron/licensing.cjs` with it (keep the `-----BEGIN/END PUBLIC KEY-----` wrapper).

Then run:
```bash
node electron/keygen.cjs "test-buyer@example.com"
```
Expected: prints a license key string. Write a quick manual check:
```bash
node -e "const {verifyLicense}=require('./electron/licensing.cjs'); const key=process.argv[1]; console.log(verifyLicense(key));" "<paste the printed key here>"
```
Expected: logs `{ email: 'test-buyer@example.com', issued: <number>, tier: 'pro' }` (not `null`).

- [ ] **Step 8: Commit**
```bash
git add electron/licensing.cjs electron/keygen.cjs .gitignore package.json
git commit -m "feat(licensing): Ed25519 license verification core + keygen tool"
```

Hand the printed private key output (`electron/private-key.pem`, gitignored) to yourself out-of-band — anyone who obtains it can mint valid Pro licenses. The exact minting command is `node electron/keygen.cjs "buyer@email.com"`.

---

## Task 2: License IPC + preload + external-link opener

**Files:**
- Modify `electron/main.cjs`
- Modify `electron/preload.cjs`
- Test `scratchpad/license-ipc.cjs`

**Interfaces consumed:** `verifyLicense`, `STORE_KEY` (Task 1).

**Interfaces produced (renderer):**
- `window.electronLicense = { activate(key): Promise<{success, entitlement?, error?}>, status(): Promise<{tier, email?, issued?}>, deactivate(): Promise<{success}> }`
- `window.electronApp = { openExternal(url): Promise<void> }`

- [ ] **Step 1: Require licensing + add `shell` to the electron import**

In `electron/main.cjs`, change line 3:
```js
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
```
Add near the other small-module requires (after line 18, `const { createScheduler } = require('./scheduler.cjs');`):
```js
const { verifyLicense, STORE_KEY: LICENSE_STORE_KEY } = require('./licensing.cjs');
```

- [ ] **Step 2: Add IPC handlers**

In `electron/main.cjs`, after the `schedule:cancel` handler (around line 347, inside the same `// ── Scheduled Recordings IPC` block's neighborhood — add a new block right after it):
```js
// ── Matrix Pro Licensing IPC ────────────────────────────────────────────────
ipcMain.handle('license:activate', async (event, key) => {
  if (!store) await initStore();
  const entitlement = verifyLicense(key);
  if (!entitlement) return { success: false, error: 'Invalid or corrupted license key' };
  store.set(LICENSE_STORE_KEY, { key, ...entitlement });
  return { success: true, entitlement };
});

ipcMain.handle('license:status', async () => {
  if (!store) await initStore();
  const saved = store.get(LICENSE_STORE_KEY);
  if (!saved || !saved.key) return { tier: 'free' };
  // Re-verify on every read so a hand-edited store value can't grant Pro.
  const entitlement = verifyLicense(saved.key);
  if (!entitlement) {
    store.delete(LICENSE_STORE_KEY);
    return { tier: 'free' };
  }
  return entitlement;
});

ipcMain.handle('license:deactivate', async () => {
  if (!store) await initStore();
  store.delete(LICENSE_STORE_KEY);
  return { success: true };
});
// ────────────────────────────────────────────────────────────────────────────

ipcMain.handle('app:openExternal', async (event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { success: false };
  await shell.openExternal(url);
  return { success: true };
});
```

- [ ] **Step 3: Expose in preload.cjs**

Add to `electron/preload.cjs`, after the `electronSchedule` block (after line 58):
```js
// Expose Matrix Pro licensing safely
contextBridge.exposeInMainWorld('electronLicense', {
  activate: (key) => ipcRenderer.invoke('license:activate', key),
  status: () => ipcRenderer.invoke('license:status'),
  deactivate: () => ipcRenderer.invoke('license:deactivate')
});

// Expose a minimal external-link opener (for the "Get Pro" payment link)
contextBridge.exposeInMainWorld('electronApp', {
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
});
```

- [ ] **Step 4: Drive test — activate, status, tamper, deactivate**

Create `scratchpad/license-ipc.cjs`:
```js
const { _electron: electron } = require('d:/Cursor/Matrix_IPTV-main/node_modules/playwright-core');
const { execSync } = require('child_process');

(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;

  // Mint a real key against whatever private key keygen.cjs already produced.
  const out = execSync('node electron/keygen.cjs "e2e-buyer@example.com"', { cwd: 'd:/Cursor/Matrix_IPTV-main' }).toString();
  const key = out.trim().split('\n').pop().trim();
  console.log('MINTED KEY LEN:', key.length);

  const app = await electron.launch({ args: ['electron/main.cjs'], cwd: 'd:/Cursor/Matrix_IPTV-main', env });
  const page = await app.firstWindow();
  await page.waitForTimeout(1000);

  const before = await page.evaluate(() => window.electronLicense.status());
  console.log('BEFORE:', JSON.stringify(before));
  if (before.tier !== 'free') throw new Error('expected free before activation');

  const activated = await page.evaluate((k) => window.electronLicense.activate(k), key);
  console.log('ACTIVATE:', JSON.stringify(activated));
  if (!activated.success || activated.entitlement.tier !== 'pro') throw new Error('activation failed');

  const after = await page.evaluate(() => window.electronLicense.status());
  console.log('AFTER:', JSON.stringify(after));
  if (after.tier !== 'pro') throw new Error('status did not report pro after activation');

  const badActivate = await page.evaluate(() => window.electronLicense.activate('not-a-real-key'));
  console.log('BAD ACTIVATE:', JSON.stringify(badActivate));
  if (badActivate.success) throw new Error('tampered key must not activate');

  const deactivated = await page.evaluate(() => window.electronLicense.deactivate());
  if (!deactivated.success) throw new Error('deactivate failed');
  const final = await page.evaluate(() => window.electronLicense.status());
  console.log('FINAL:', JSON.stringify(final));
  if (final.tier !== 'free') throw new Error('did not revert to free after deactivate');

  console.log('license-ipc.cjs PASS');
  await app.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
```

- [ ] **Step 5: Build + run**
```bash
npm run build
node "<scratchpad>/license-ipc.cjs"
```
Expected: `license-ipc.cjs PASS` (free → pro → rejected-tamper → free).

- [ ] **Step 6: Commit**
```bash
git add electron/main.cjs electron/preload.cjs
git commit -m "feat(licensing): license IPC + preload + external-link opener"
```

---

## Task 3: `entitlementsStore` + `requirePro` helper

**Files:**
- Create `src/store/entitlementsStore.js`
- Create `src/utils/requirePro.js`
- Create `src/config/pro.js`

**Interfaces consumed:** `window.electronLicense.{status,activate,deactivate}` (Task 2).

**Interfaces produced:**
- `useEntitlementsStore()` → `{ tier, email, issued, hydrated, refresh(), activate(key), deactivate(), isPro() }`
- `requirePro(isProFn, action, openUpsell)`
- `PAYMENT_URL`

- [ ] **Step 1: `src/config/pro.js`**

Create `src/config/pro.js`:
```js
// Placeholder — swap for the real Stripe/Google Play checkout link before shipping.
export const PAYMENT_URL = 'https://example.com/buy-matrix-pro';
```

- [ ] **Step 2: `entitlementsStore.js`**

Create `src/store/entitlementsStore.js`:
```js
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
    const res = await window.electronLicense.activate(key);
    if (res?.success) {
      set({ tier: 'pro', email: res.entitlement.email, issued: res.entitlement.issued });
    }
    return res;
  },

  deactivate: async () => {
    if (!hasLicenseBridge()) return { success: false };
    const res = await window.electronLicense.deactivate();
    if (res?.success) set({ tier: 'free', email: null, issued: null });
    return res;
  },

  isPro: () => get().tier === 'pro',
}));
```

- [ ] **Step 3: `requirePro.js`**

Create `src/utils/requirePro.js`:
```js
// Runs `action` if entitled, otherwise routes to the upsell. One-line gate
// call shape shared by every locked feature (Record button, Recordings,
// 2nd+ source).
export function requirePro(isProFn, action, openUpsell) {
  if (isProFn()) {
    action();
  } else {
    openUpsell();
  }
}
```

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: build succeeds (nothing consumes these modules yet, so this only checks syntax).

- [ ] **Step 5: Commit**
```bash
git add src/store/entitlementsStore.js src/utils/requirePro.js src/config/pro.js
git commit -m "feat(licensing): entitlements store + requirePro gate helper"
```

---

## Task 4: `UpsellModal`

**Files:**
- Create `src/components/UpsellModal.jsx`

**Interfaces consumed:** `useEntitlementsStore` (Task 3), `PAYMENT_URL` (Task 3), `window.electronApp.openExternal` (Task 2).

**Interfaces produced:** `<UpsellModal open, onClose, reason? />`

- [ ] **Step 1: Create the component**

Create `src/components/UpsellModal.jsx`:
```jsx
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
        <div className="w-full max-w-md bg-[#0c2a2d] border border-gray-700 rounded-2xl shadow-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <LucideLock size={20} className="text-amber-400" />
              <h2 className="text-xl font-bold text-white">Matrix Pro</h2>
            </div>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded-lg focus:outline-none">
              <LucideX size={20} />
            </button>
          </div>

          {reason && <p className="text-sm text-amber-300/90 mb-4">{reason}</p>}

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
            className="w-full mb-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300"
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
                className="flex-1 bg-[#0a1f22] border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleActivate}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold focus:outline-none"
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
```

- [ ] **Step 2: Build**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**
```bash
git add src/components/UpsellModal.jsx
git commit -m "feat(licensing): Matrix Pro upsell modal"
```

---

## Task 5: Settings → License panel

**Files:**
- Modify `src/components/SettingsDrawer.jsx`

**Interfaces consumed:** `useEntitlementsStore` (Task 3).

- [ ] **Step 1: Import + add the sidebar section**

In `src/components/SettingsDrawer.jsx`, add to the icon import (line 5-9):
```jsx
import {
  LucideSettings, LucidePalette, LucideMonitorPlay, LucideDatabase,
  LucideUsers, LucideTerminal, LucideInfo, LucideX, LucideChevronRight,
  LucideCalendarDays, LucideKeyboard, LucideKey
} from 'lucide-react';
```
Add near the top of the file (after the existing imports, before the component):
```jsx
import { useEntitlementsStore } from '../store/entitlementsStore.js';
```
Add the sidebar button before the `about` divider (after line 51, `shortcuts`, and before `advanced` — or anywhere in the list; place it right after `profiles` for visibility):
```jsx
            <SectionButton id="license" icon={<LucideKey size={16} />} label="License" active={activeSection === 'license'} onClick={setActiveSection} />
```
Add the content switch case (after line 64, `shortcuts`):
```jsx
            {activeSection === 'license' && <LicenseSettings />}
```

- [ ] **Step 2: `LicenseSettings` panel**

Add this function alongside `AdvancedSettings`/`AboutSettings` (near line 383):
```jsx
function LicenseSettings() {
  const { tier, email, issued, hydrated, refresh, activate, deactivate } = useEntitlementsStore();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const isPro = tier === 'pro';

  const handleActivate = async () => {
    if (!key.trim() || busy) return;
    setBusy(true);
    setStatus({ type: '', msg: '' });
    try {
      const res = await activate(key.trim());
      setStatus(res?.success
        ? { type: 'success', msg: 'License activated.' }
        : { type: 'error', msg: res?.error || 'That key was not accepted.' });
      if (res?.success) setKey('');
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    setBusy(true);
    try {
      await deactivate();
      setStatus({ type: 'success', msg: 'License deactivated.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">License</h3>
        <p className="text-sm text-gray-400 mb-6">Activate Matrix Pro to unlock DVR recording, Recordings, and unlimited sources.</p>
      </div>

      <div className="p-4 bg-[#123236] rounded-xl border border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-white">{isPro ? 'Matrix Pro (active)' : 'Free tier'}</div>
            {isPro && email && <div className="text-sm text-gray-400 mt-1">Licensed to {email}{issued ? ` · activated ${new Date(issued).toLocaleDateString()}` : ''}</div>}
          </div>
          <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded ${isPro ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-600/40 text-gray-300'}`}>
            {isPro ? 'Pro' : 'Free'}
          </span>
        </div>
      </div>

      {!isPro && (
        <div className="p-4 bg-[#123236] rounded-xl border border-gray-700 space-y-3">
          <div className="font-medium text-white">Activate a license</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              placeholder="Paste your license key"
              className="flex-1 bg-[#0a1f22] border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleActivate}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold focus:outline-none"
            >
              Activate
            </button>
          </div>
        </div>
      )}

      {isPro && (
        <button
          onClick={handleDeactivate}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 disabled:opacity-50 text-sm font-semibold focus:outline-none"
        >
          Deactivate license
        </button>
      )}

      {status.msg && (
        <p className={`text-xs ${status.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{status.msg}</p>
      )}

      {!window.desktop?.isElectron && (
        <p className="text-xs text-yellow-500 px-1">License activation is available in the desktop app only.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Import `useEffect`**

Change line 1 of `src/components/SettingsDrawer.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
```

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/components/SettingsDrawer.jsx
git commit -m "feat(licensing): License panel in Settings"
```

---

## Task 6: Gate the DVR Record button

**Files:**
- Modify `src/components/player/PlayerControls.jsx`

**Interfaces consumed:** `useEntitlementsStore` (Task 3), `<UpsellModal>` (Task 4).

- [ ] **Step 1: Import entitlements + upsell modal, add lock state**

In `src/components/player/PlayerControls.jsx`, add to imports (after line 5):
```jsx
import { useEntitlementsStore } from '../../store/entitlementsStore.js';
import UpsellModal from '../UpsellModal.jsx';
import { LucideLock } from 'lucide-react';
```
Update the lucide-react import on line 2 to add `LucideLock` there instead if preferred — either works; keep one import per module. Inside the component, after `const [isRecording, setIsRecording] = useState(false);` (line 47) add:
```jsx
  const isPro = useEntitlementsStore((s) => s.isPro());
  const [upsellOpen, setUpsellOpen] = useState(false);
```

- [ ] **Step 2: Gate `toggleRecord`**

Replace the `toggleRecord` function (lines 69-85):
```jsx
  const toggleRecord = async () => {
    if (!canRecord || !activeChannel) return;
    if (!isPro) { setUpsellOpen(true); return; }
    const id = String(activeChannel.id);
    showControlsTemporarily();
    try {
      if (isRecording) {
        await window.electronRecording.stop(id);
        setIsRecording(false);
      } else {
        setIsRecording(true); // optimistic
        const res = await window.electronRecording.start(id, activeUrl, activeChannel.name);
        if (res && res.success === false) setIsRecording(false);
      }
    } catch {
      setIsRecording(false);
    }
  };
```

- [ ] **Step 3: Show a lock badge on the button when free**

Replace the button block (lines 188-203):
```jsx
            {canRecord && (
              <button
                onClick={toggleRecord}
                title={isPro ? (isRecording ? 'Stop recording' : 'Record') : 'Matrix Pro required'}
                className={`flex items-center gap-2 transition-colors focus:outline-none ${
                  isRecording ? 'text-red-500' : 'text-white hover:text-red-400'
                }`}
              >
                {!isPro
                  ? <LucideLock size={18} className="text-amber-400" />
                  : isRecording
                    ? <LucideSquare size={20} className="fill-red-500" />
                    : <LucideCircle size={22} className="fill-red-500 text-red-500" />}
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {isPro ? (isRecording ? 'Recording' : 'Rec') : 'Rec'}
                </span>
              </button>
            )}
            <UpsellModal
              open={upsellOpen}
              onClose={() => setUpsellOpen(false)}
              reason="DVR recording is a Matrix Pro feature."
            />
```

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/components/player/PlayerControls.jsx
git commit -m "feat(licensing): gate DVR Record button behind Matrix Pro"
```

---

## Task 7: Gate the Recordings view

**Files:**
- Modify `src/components/RecordingsView.jsx`

**Interfaces consumed:** `useEntitlementsStore` (Task 3), `<UpsellModal>` (Task 4).

- [ ] **Step 1: Rewrite `RecordingsView.jsx`**

Replace the full file:
```jsx
import React, { useState } from 'react';
import RecordingLibrary from './RecordingLibrary.jsx';
import RecordingDashboard from './RecordingDashboard.jsx';
import ScheduledList from './ScheduledList.jsx';
import UpsellModal from './UpsellModal.jsx';
import { useEntitlementsStore } from '../store/entitlementsStore.js';
import { LucideLock } from 'lucide-react';

const SEGMENTS = [
  { id: 'library', label: 'Library' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'active', label: 'Active' },
];

export default function RecordingsView() {
  const [segment, setSegment] = useState('library');
  const isPro = useEntitlementsStore((s) => s.isPro());
  const [upsellOpen, setUpsellOpen] = useState(!isPro);

  if (!isPro) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-12">
        <LucideLock size={48} className="text-amber-400 mb-6" />
        <div className="text-xl font-bold text-slate-200 mb-2">Recordings is a Matrix Pro feature</div>
        <div className="text-sm text-slate-500 max-w-sm mb-6">Unlock DVR recording, scheduled recordings, and your Recordings library.</div>
        <button
          onClick={() => setUpsellOpen(true)}
          className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold focus:outline-none"
        >
          Unlock Matrix Pro
        </button>
        <UpsellModal
          open={upsellOpen}
          onClose={() => setUpsellOpen(false)}
          reason="Recordings is a Matrix Pro feature."
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-2 px-6 pt-6">
        {SEGMENTS.map((s, index) => (
          <button
            key={s.id}
            onClick={() => setSegment(s.id)}
            data-nav-zone="recordings-segments"
            data-nav-index={index}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 ${
              segment === s.id
                ? 'bg-sky-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {segment === 'library' ? <RecordingLibrary />
          : segment === 'scheduled' ? <ScheduledList />
          : <RecordingDashboard />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**
```bash
git add src/components/RecordingsView.jsx
git commit -m "feat(licensing): gate Recordings view behind Matrix Pro"
```

---

## Task 8: Gate 2nd+ source in Source Manager

**Files:**
- Modify `src/components/SourceManagerView.jsx`

**Interfaces consumed:** `useEntitlementsStore` (Task 3), `useActiveProfile` (`src/store/profileStore.ts:888`), `<UpsellModal>` (Task 4).

**Note:** `useActiveProfile` is already imported at the top of this file (`src/components/SourceManagerView.jsx:2`, alongside `useProfilesStore`) and already used by `XtreamManager` (line 612) — only `useEntitlementsStore` and `UpsellModal` are new imports.

- [ ] **Step 1: Add imports**

In `src/components/SourceManagerView.jsx`, add after the existing import block (after line 8):
```jsx
import { useEntitlementsStore } from '../store/entitlementsStore.js';
import UpsellModal from './UpsellModal.jsx';
```

- [ ] **Step 2: Gate `M3uUrlManager.handleAdd`**

In `M3uUrlManager` (starting line 105), add after `const addM3uPlaylist = useProfilesStore((s) => s.addM3uPlaylist);` (line 111):
```jsx
  const isPro = useEntitlementsStore((s) => s.isPro());
  const activeProfile = useActiveProfile();
  const [upsellOpen, setUpsellOpen] = useState(false);
```
Replace the start of `handleAdd` (line 113):
```jsx
  const handleAdd = async () => {
    if (!url) return;
    if (!isPro && (activeProfile?.playlists || []).length >= 1) {
      setUpsellOpen(true);
      return;
    }
    if (isProcessing) {
       abortControllerRef.current?.abort();
    }
```
(the rest of the function body is unchanged). Add the modal as the last child of the component's root `<div>` (the JSX returned by `M3uUrlManager`, closing where its `return (...)` block ends):
```jsx
      <UpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        reason="The free tier includes 1 source. Add unlimited sources with Matrix Pro."
      />
```

- [ ] **Step 3: Gate `XtreamManager.handleAdd`**

In `XtreamManager` (starting line 602), add after `const activeProfile = useActiveProfile();` (line 612):
```jsx
  const isPro = useEntitlementsStore((s) => s.isPro());
  const [upsellOpen, setUpsellOpen] = useState(false);
```
Replace the start of `handleAdd` (line 616):
```jsx
  const handleAdd = async () => {
    if (!canSubmit) return;
    if (!isPro && (activeProfile?.playlists || []).length >= 1) {
      setUpsellOpen(true);
      return;
    }

    const base = server.trim().replace(/\/+$/, '');
```
(the rest of the function body is unchanged). Add the modal as the last child inside the root `<div className="animate-in fade-in slide-in-from-bottom-4 duration-500">` (line 705), right before its closing `</div>` at line 756:
```jsx
      <UpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        reason="The free tier includes 1 source. Add unlimited sources with Matrix Pro."
      />
```

- [ ] **Step 4: Build**
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**
```bash
git add src/components/SourceManagerView.jsx
git commit -m "feat(licensing): gate 2nd+ source behind Matrix Pro"
```

---

## Task 9: End-to-end verification (real Electron)

**Files:** Test `scratchpad/paywall-e2e.cjs`

- [ ] **Step 1: Drive the full free→pro→free lifecycle**

Create `scratchpad/paywall-e2e.cjs`:
```js
const { _electron: electron } = require('d:/Cursor/Matrix_IPTV-main/node_modules/playwright-core');
const { execSync } = require('child_process');

(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const out = execSync('node electron/keygen.cjs "e2e-full@example.com"', { cwd: 'd:/Cursor/Matrix_IPTV-main' }).toString();
  const key = out.trim().split('\n').pop().trim();

  const app = await electron.launch({ args: ['electron/main.cjs'], cwd: 'd:/Cursor/Matrix_IPTV-main', env });
  const page = await app.firstWindow();
  await page.waitForTimeout(1000);

  // Free: status is free.
  let status = await page.evaluate(() => window.electronLicense.status());
  if (status.tier !== 'free') throw new Error('expected free tier on fresh launch');
  console.log('Free tier confirmed on fresh launch.');

  // Tampered key rejected.
  const bad = await page.evaluate(() => window.electronLicense.activate('tampered.key'));
  if (bad.success) throw new Error('tampered key must not activate');
  console.log('Tampered key correctly rejected.');

  // Valid key activates.
  const good = await page.evaluate((k) => window.electronLicense.activate(k), key);
  if (!good.success || good.entitlement.tier !== 'pro') throw new Error('valid key failed to activate');
  status = await page.evaluate(() => window.electronLicense.status());
  if (status.tier !== 'pro') throw new Error('status not pro after valid activation');
  console.log('Valid key activated Pro.');

  // Deactivate reverts to free.
  const off = await page.evaluate(() => window.electronLicense.deactivate());
  if (!off.success) throw new Error('deactivate failed');
  status = await page.evaluate(() => window.electronLicense.status());
  if (status.tier !== 'free') throw new Error('did not revert to free after deactivate');
  console.log('Deactivate reverted to free.');

  console.log('paywall-e2e.cjs PASS');
  await app.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
```

- [ ] **Step 2: Build + run**
```bash
npm run build
node "<scratchpad>/paywall-e2e.cjs"
```
Expected: `paywall-e2e.cjs PASS`.

- [ ] **Step 3: Manual UI pass (not automatable without a real license workflow through the modal)**

In the running app (`npm run electron` or the packaged build): confirm the Record button shows a 🔒 and opens `UpsellModal` on click while free; confirm adding a 2nd source opens the upsell instead of adding; confirm Recordings shows the locked state; paste a `keygen.cjs`-minted key into Settings → License → Activate; confirm all three gates unlock; Deactivate and confirm they re-lock.

- [ ] **Step 4: Commit any fixes found during verification**
```bash
git add -A && git commit -m "test(licensing): paywall end-to-end verification" || echo "nothing to commit"
```

---

## Self-Review Notes
- **Coverage:** verifyLicense + keygen (T1), IPC/preload/openExternal (T2), entitlementsStore/requirePro/PAYMENT_URL (T3), UpsellModal (T4), Settings License panel (T5), Record button gate (T6), Recordings gate (T7), source-cap gate (T8), e2e (T9). Matches every "What gets built" bullet in the brief.
- **Types:** `verifyLicense` return shape `{email, issued, tier}` identical across licensing.cjs, main.cjs IPC responses, entitlementsStore, and both test scripts. `license:status` free-path always returns `{ tier: 'free' }` (no stray fields) consistently checked as `res.tier`.
- **Security caveat honored:** stated once in the design doc's "Key limitation" section per the brief's "I'll say this once ... and move on" instruction — not repeated in every task.
- **Free tier stays usable:** no task touches live TV, VOD/series, EPG, or Continue Watching — only Record button, Recordings view, and the 2nd-source guard clause are gated.
- **Packaging safety:** Task 1 gitignores the private key and excludes `electron/keygen.cjs` + `electron/private-key.pem` from `package.json`'s `build.files` array, so electron-builder's `electron/**/*` glob never ships them.
