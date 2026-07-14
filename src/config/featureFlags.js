// src/config/featureFlags.js
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Migration Feature Flags
//
// Central, read-only registry of migration feature flags. These gate the
// gradual move of Live TV off the renderer M3U parser and onto the SQLite
// (Path B) data source.
//
// IMPORTANT (Phase 2.1): Every flag here defaults to FALSE. Nothing in this
// phase changes runtime behavior. The DB-backed Live TV source is introduced
// as an *adapter + parity check only*; it is NOT wired into the production
// render path. Flags are read here so Phase 2.2 can flip them in a controlled
// test environment without touching call sites.
//
// Vite exposes build-time env as `import.meta.env.VITE_*`. To enable a flag in
// a test build, set the env var (e.g. `VITE_USE_DB_CHANNELS=true`) — do NOT
// change the defaults below.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads a boolean flag from Vite env, defaulting to `false` when unset.
 * Only the exact string 'true' enables a flag; anything else stays off.
 *
 * @param {string} key The `VITE_`-prefixed env key
 * @returns {boolean}
 */
function readBoolFlag(key) {
  try {
    const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
    return env ? env[key] === 'true' : false;
  } catch {
    return false;
  }
}

/**
 * When true, Live TV would source channels from SQLite via the DB channel
 * adapter instead of the renderer M3U parser. Phase 2.1 keeps this OFF and
 * only uses the adapter for read-only parity diagnostics.
 *
 * Default: false (do not enable in Phase 2.1).
 */
export const USE_DB_CHANNELS = readBoolFlag('VITE_USE_DB_CHANNELS');

/**
 * When true, emits the renderer-vs-SQLite parity diagnostics after the renderer
 * pipeline populates the store. Purely observational (console/log only).
 * Independent of USE_DB_CHANNELS so parity can be measured while the DB source
 * stays disabled. Defaults ON in dev, OFF in production, and can be forced with
 * `VITE_DB_CHANNEL_PARITY=true` / `=false`.
 */
export const DB_CHANNEL_PARITY = (() => {
  try {
    const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
    if (!env) return false;
    if (env.VITE_DB_CHANNEL_PARITY === 'true') return true;
    if (env.VITE_DB_CHANNEL_PARITY === 'false') return false;
    return Boolean(env.DEV); // default: on in dev only
  } catch {
    return false;
  }
})();

export const featureFlags = {
  USE_DB_CHANNELS,
  DB_CHANNEL_PARITY,
};
