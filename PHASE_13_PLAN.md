# Phase 13: Core UX/UI Redesign & Architecture Fixes

This document serves as the roadmap for Phase 13. We are splitting the implementation into two phases to ensure stability.

## Phase 13A: Core Usability (Next Up)
- **Electron Context Menu:** Inject native `webContents.on('context-menu')` handler in `electron/main.cjs` for Right-Click Copy/Paste functionality.
- **Playlists Redesign:** Delete the cluttered `SettingsModal`. Build a new dedicated `PlaylistsManager.jsx` view for managing M3U URLs and EPG sources, mapped to the Sidebar's "Playlists" button.
- **Settings & Routing Fixes:** Move the Dark Mode toggle into `SettingsPanel.jsx`. Ensure the Sidebar correctly routes clicks for Movies, Series, Playlists, and Settings.

## Phase 13B: TV Viewing Experience
- **Live TV Categories:** Modify `EPGGrid.jsx` to parse unique `group-title` tags from M3U playlists and add a horizontal, spatially-navigable Category Bar above the TV guide to sort channels.
- **Fullscreen Playback:** Modify `supreme_layout.jsx` so that when a channel is clicked, the UI transitions to a `player` view, auto-hiding the EPG so the background stream plays completely fullscreen.

*Note for next agent: Resume execution starting with Phase 13A.*
