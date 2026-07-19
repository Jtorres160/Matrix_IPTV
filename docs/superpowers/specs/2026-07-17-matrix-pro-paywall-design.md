# Matrix Pro Paywall — Design

**Date:** 2026-07-17
**Branch:** `fix/sqlite-refresh-sync`
**Status:** Approved (design)

## Goal

Add a monetization layer gating features already shipped: DVR record-now,
Recordings (Library/Scheduled), and multi-source support. One-time purchase,
verified offline via an Ed25519-signed license key. Free tier stays a fully
usable, converting demo: live TV, VOD/series, EPG, Continue Watching, 1
source.

## Non-goals (v1, YAGNI)

- In-app payment / card collection. Payment happens outside the app
  (Stripe/Google Play); the app only opens a placeholder URL.
- A license server, revocation list, or per-device binding. Verification is
  pure offline signature check.
- Subscription/renewal/expiry. `tier` is `'pro'` forever once activated.
- Multiple paid tiers. Only `free` and `pro`.

## Key limitation (stated honestly in the UI/handoff)

Client-side signature verification stops casual key sharing and naive
tampering (editing the persisted store, guessing keys) — it does **not**
stop a determined reverse engineer who patches the verify call or extracts
a valid key and republishes it. Real anti-piracy needs a license server;
out of scope for a one-day build. `license:status` re-verifies the
persisted key's signature on every read (not just at activate time) so at
least a corrupted/hand-edited store value can't silently grant Pro.

## Key facts (verified in code)

- `electron/main.cjs:53,65-68` — `store` is a lazily-initialized
  `electron-store` instance (`async function initStore()`); every handler
  that touches it guards with `if (!store) await initStore();`
  (`main.cjs:161-178`).
- IPC handlers are registered directly in `main.cjs` with
  `ipcMain.handle('namespace:action', ...)` (recording/schedule/store
  examples at `main.cjs:161-347`); no central router.
- `electron/preload.cjs` exposes one `contextBridge.exposeInMainWorld` block
  per namespace (`electronRecording`, `electronSchedule`, `electronStore`,
  `electronDB`, `electronLog`, plus a static `desktop.isElectron` flag).
- Electron `^31.3.0` bundles Node 20 — `crypto.generateKeyPairSync('ed25519')`
  / `crypto.sign(null, buf, privateKey)` / `crypto.verify(null, buf,
  publicKey, sig)` are available with no new dependency.
- DVR instant-record button lives in
  `src/components/player/PlayerControls.jsx:55` (`canRecord` guard) and
  `:69-85` (`toggleRecord`); the `<button>` renders at `:188-203`.
- `src/components/RecordingsView.jsx` renders Library/Scheduled/Active
  segments unconditionally — gating point for the whole view.
- Sources live in Zustand `useProfilesStore` (`src/store/profileStore.ts`),
  per-profile `profile.playlists` array. Add flows: `M3uUrlManager.handleAdd`
  (`src/components/SourceManagerView.jsx:113`, calls `addM3uPlaylist` at
  `:150`) and the Xtream manager's `handleAdd` (`:616`, `addM3uPlaylist` at
  `:660`). Current count read via `activeProfile?.playlists || []`
  (`:345`, `:613`) — `useActiveProfile()` (`src/store/profileStore.ts:888`)
  is the hook to reuse.
- `src/components/SettingsDrawer.jsx` — sidebar `SectionButton`s
  (`:46-54`) + content switch (`:59-66`); `ToggleRow`/`TextFieldRow`
  primitives (`:97`, `:123`) are the shared form styling to reuse for a new
  License panel.
- `src/store/resumeStore.js` is the house Zustand-persist convention: a
  `getStorage()` shim that reads/writes via `window.electronStore` when
  present, falls back to an in-memory `Map` in browser/dev mode.
- No `shell.openExternal` IPC exists yet — needed for the "Get Pro" link.

## Decisions

1. **License format:** `<base64url(payloadJSON)>.<base64url(signature)>`.
   Payload: `{ email, issued, tier: 'pro' }`. Verified with
   `crypto.verify(null, payloadBuf, publicKey, sigBuf)` (Ed25519, no hash —
   `null` algorithm is correct/required for Ed25519 in Node's `crypto`).
2. **Public key is bundled** as a PEM constant in `electron/licensing.cjs`.
   The private key lives only in `electron/keygen.cjs`'s output
   (`electron/private-key.pem`, gitignored, never bundled/packaged).
3. **Entitlement truth lives in the main process.** `license:status`
   re-verifies the persisted key's signature every call; the renderer's
   `entitlementsStore` is just a cache of the last IPC-verified answer, not
   a trusted source itself.
4. **Free cap = 1 source.** Enforced in the renderer at the two
   `handleAdd` call sites by checking `useActiveProfile().playlists.length`.
   This is a UX gate (stated caveat above), not a security boundary.
5. **Gates:** DVR Record button, Recordings view (all segments), 2nd+
   source. License activation panel is always reachable regardless of tier.

## Architecture

### `electron/licensing.cjs` (new)
- `PUBLIC_KEY_PEM` constant (placeholder until `keygen.cjs` is run once;
  swapped in by hand before shipping).
- `verifyLicense(key: string) → { email, issued, tier } | null` — pure,
  no I/O, unit-tested directly with `node`. Any parse/format/signature
  failure returns `null` (never throws).

### `electron/keygen.cjs` (new, dev-only — never bundled)
- No args: `crypto.generateKeyPairSync('ed25519')`, writes the private key
  PEM to `electron/private-key.pem` (mode `0o600`, gitignored), prints the
  public key PEM to paste into `licensing.cjs`. Idempotent — reuses the
  existing private key file if present.
- `node electron/keygen.cjs "buyer@email.com"`: loads/creates the keypair,
  builds `{ email, issued: Date.now(), tier: 'pro' }`, signs it, prints the
  license key string to email the buyer.

### `electron/main.cjs` (modify)
- `const { verifyLicense } = require('./licensing.cjs');` alongside the
  `db.cjs`/`recordingLibrary.cjs`/`scheduler.cjs` requires.
- `ipcMain.handle('license:activate', ...)`, `'license:status'`,
  `'license:deactivate'` — same inline style and `if (!store) await
  initStore();` guard as `store:get` (`main.cjs:161-164`). Persisted under
  `iptv.license.v1` as `{ key, email, issued, tier }`.
- `ipcMain.handle('app:openExternal', (event, url) => shell.openExternal(url))`
  for the "Get Pro" placeholder link (`shell` added to the existing
  `electron` import destructure).

### `electron/preload.cjs` (modify)
- `window.electronLicense = { activate(key), status(), deactivate() }`
  (same `ipcRenderer.invoke` shape as `electronSchedule`).
- `window.electronApp = { openExternal(url) }`.

### Renderer

- **`src/config/pro.js`** (new) — `export const PAYMENT_URL = '<placeholder>';`
  single line to swap when a real Stripe/Play link exists.
- **`src/store/entitlementsStore.js`** (new) — plain (non-persisted)
  Zustand store: `{ tier: 'free', email: null, issued: null, hydrated:
  false, refresh(), activate(key), deactivate(), isPro() }`. `refresh()`
  calls `window.electronLicense.status()` and sets state; called once on
  app mount. Not persisted client-side (Decision 3) — always re-hydrated
  from the main-process-verified source of truth.
- **`src/utils/requirePro.js`** (new) — `requirePro(isProFn, action,
  openUpsell)`: calls `action()` if `isProFn()` else calls `openUpsell()`.
  Trivial, but gives every gate the same one-line call shape.
- **`src/components/UpsellModal.jsx`** (new) — benefit list, license-key
  paste input (`entitlementsStore.activate`), "Get Pro" button
  (`window.electronApp.openExternal(PAYMENT_URL)`).
- **`src/components/SettingsDrawer.jsx`** (modify) — new `license`
  `SectionButton` + `LicenseSettings()` panel (activate/status/deactivate),
  styled like `AdvancedSettings`/`AboutSettings`.
- **`src/components/player/PlayerControls.jsx`** (modify) — Record button
  gated: Free → shows a 🔒 badge, click opens `UpsellModal` instead of
  calling `toggleRecord`.
- **`src/components/RecordingsView.jsx`** (modify) — Free → renders a
  locked state (with an "Unlock Matrix Pro" CTA opening `UpsellModal`)
  instead of the segmented Library/Scheduled/Active content.
- **`src/components/SourceManagerView.jsx`** (modify) — both `handleAdd`
  functions (M3U `:113`, Xtream `:616`) check
  `useActiveProfile().playlists.length >= 1 && !isPro` before proceeding;
  free users seeing a 2nd-source attempt get `UpsellModal` instead.

## Error handling
- `verifyLicense` returns `null` (never throws) for malformed keys, bad
  base64, bad signature, or a payload missing/wrong-typed fields.
- `license:activate` with an invalid key → `{ success: false, error: '...' }`,
  nothing persisted.
- `license:status` re-verifies on read; a tampered persisted blob is
  deleted and the app reports back to `free`.
- `entitlementsStore.refresh()` failure (no `window.electronLicense`, e.g.
  browser dev mode) → stays `free`, no throw.

## Testing (real Electron, provider-free)
1. `node` unit test for `verifyLicense`: valid key → payload; forged
   signature → `null`; garbage string → `null`; tampered payload with
   original signature → `null`.
2. Real-Electron: fresh app → `license:status` → `free`; Record button
   shows 🔒; adding a 2nd source is blocked with the upsell.
3. Mint a valid key via `keygen.cjs`, `license:activate` it → `status`
   returns `{ tier: 'pro', ... }`; Record button now works; Recordings
   view unlocks; 2nd source add succeeds.
4. `license:activate` a tampered key → rejected, stays `free`.
5. `license:deactivate` → reverts to `free`, gates re-lock.

## New dependencies
None — Ed25519 via Node's built-in `crypto`; `shell.openExternal` is part
of Electron's existing `electron` module.
