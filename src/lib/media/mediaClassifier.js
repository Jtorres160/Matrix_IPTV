// Shim: the classifier is shared with the Electron main process (M3U ingestion
// routes rows with the same heuristics the renderer uses). Canonical source
// lives under electron/shared/ because electron-builder packages electron/**
// but not src/**.
export * from '../../../electron/shared/mediaClassifier.mjs';
