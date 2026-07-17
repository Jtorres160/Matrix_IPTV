import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import XtreamClient from '../services/xtreamClient.js'

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL PROFILE STORE (Phase 0 consolidation)
//
// This is now the single source of truth for user profiles. It is the union of
// the two historical stores (src/profileStore.js + src/store/profileStore.ts),
// which previously BOTH persisted to `iptv.profiles.v1` with incompatible
// schemas and corrupted each other's data.
//
// Persistence key was bumped to `iptv.profiles.v2`. On first launch we read the
// old `iptv.profiles.v1` payload (whichever store wrote it last) and normalize
// it so existing users keep their profiles, favorites and watch history.
//
// NOTE: `onFinishHydration` is NOT a valid persist *option* in zustand 4.x
// (it is a listener method on `store.persist`). The real option is
// `onRehydrateStorage`, which is what we use below for normalization + the
// v1 → v2 bridge.
// ─────────────────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system'
export type PlayerPreference = 'internal' | 'vlc'

export type ProfileSettings = {
	/** UI theme preference */
	theme: ThemeMode
	/** Player selection */
	playerPreference: PlayerPreference
	/** Auto-refresh EPG/playlist toggle */
	autoRefresh: boolean
	/** EPG Grid Scaling (compact, normal, large) */
	epgScale: 'compact' | 'normal' | 'large'
	/** Color Aesthetic Overlays */
	colorOverlay: string
	/** Channel Column Width (px) */
	channelColumnWidth: number
	/** Phase 9: Hashed Parental PIN */
	parentalPin?: string
	/** Phase 10: TMDB API Key for metadata */
	tmdbApiKey?: string
	/** Resume the last watched channel automatically on app launch */
	autoplayLastChannel?: boolean
	/** Custom User-Agent sent with playlist/EPG/stream requests (empty = default) */
	customUserAgent?: string
	/** Custom XMLTV EPG URL; overrides the playlist's x-tvg-url header when set */
	epgUrlOverride?: string
}

/** Rich playlist object (Live TV pipeline). Legacy string playlists are coerced on load. */
export type Playlist = {
	id: string
	name: string
	type: string
	url?: string
	active?: boolean
	status?: string
	channelCount?: number
	lastUpdated?: number
	createdAt?: number
	lastError?: string | null
	serverUrl?: string
	username?: string
	password?: string
}

export type UserProfile = {
	id: string
	name: string
	/** Playlist objects for this profile (Live TV) */
	playlists: Playlist[]
	/** Channel IDs favorited within this profile */
	favorites: Array<string | number>
	/** Watch history for the "Continue Watching" rail */
	watchHistory: any[]
	/** Legacy field, migrated into watchHistory on load */
	recentlyWatched?: any[]
	settings: ProfileSettings
}

type ProfilesState = {
	profiles: Record<string, UserProfile>
	activeProfileId: string | null
	activePlaylistId: string | null
	isPremium: boolean
	syncStates: Record<string, any>
	/** DB-backed favorites for the active playlist (VOD/SQLite pipeline) */
	favorites: number[]
	isParentalUnlocked: boolean

	// Derived selectors
	getActiveProfile: () => UserProfile | null
	getActiveSettings: () => ProfileSettings | null

	// Premium
	setPremiumStatus: (status: boolean) => void

	// Profile CRUD
	createProfile: (name: string) => string
	deleteProfile: (profileId: string) => void
	renameProfile: (profileId: string, name: string) => void
	setActiveProfile: (profileId: string) => void
	updateSettings: (partial: Partial<ProfileSettings>) => void

	// Per-profile favorites (Live TV)
	toggleFavorite: (channelId: string | number) => void

	// Watch history (Live TV)
	updateWatchHistory: (channelId: string | number, durationSeconds?: number) => void
	addRecentlyWatched: (channelId: string | number) => void

	// Playlist management (object-based, Live TV pipeline)
	setPlaylists: (playlists: any[]) => void
	addPlaylist: (url: string) => void
	addM3uPlaylist: (playlistData: any) => void
	updatePlaylist: (id: string, updates: Partial<Playlist>) => void
	addXtreamPlaylist: (
		name: string,
		serverUrl: string,
		username: string,
		password: string
	) => Promise<any>
	removePlaylist: (urlOrId: string) => void

	// Phase 7 SQLite Integration
	addPlaylistToDB: (profileId: string, playlistData: any) => Promise<string>
	deletePlaylistFromDB: (playlistId: string) => Promise<void>
	setActivePlaylistInDB: (playlistId: string) => Promise<void>
	updateSyncProgress: (playlistId: string, progressData: any) => void

	// Phase 8 SQLite Favorites
	setFavorites: (favorites: number[]) => void
	toggleFavoriteState: (channelId: number) => void
	toggleFavoriteInDB: (playlistId: string, channelId: number) => Promise<void>
	loadFavoritesFromDB: (playlistId: string) => Promise<void>

	// Phase 9 Parental Control
	setParentalPin: (pin: string) => Promise<void>
	verifyParentalPin: (pin: string) => Promise<boolean>
	unlockParental: (pin: string) => Promise<boolean>
	lockParental: () => void
	toggleCategoryLockInDB: (playlistId: string, groupTitle: string) => Promise<void>
}

// Default theme is 'dark' to preserve the existing Live TV appearance for new profiles.
const DEFAULT_SETTINGS: ProfileSettings = {
	theme: 'dark',
	playerPreference: 'internal',
	// Refresh playlists/EPG silently on startup so channel lists stay current
	autoRefresh: true,
	epgScale: 'normal',
	colorOverlay: 'semi-transparent',
	channelColumnWidth: 300,
	tmdbApiKey: '',
	autoplayLastChannel: false,
	customUserAgent: '',
	epgUrlOverride: '',
}

const STORAGE_KEY = 'iptv.profiles.v2'
const OLD_STORAGE_KEY = 'iptv.profiles.v1'

// --- Helper: PIN Hashing ---
async function hashPin(pin: string): Promise<string> {
	const msgUint8 = new TextEncoder().encode(pin)
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function createDefaultProfile(): UserProfile {
	return {
		id: nanoid(),
		name: 'Default',
		playlists: [],
		favorites: [],
		watchHistory: [],
		settings: { ...DEFAULT_SETTINGS },
	}
}

// ── Async storage bridge (electron-store in Electron, localStorage on web) ────
const getStorage = () => {
	if (typeof window !== 'undefined' && (window as any).electronStore) {
		const electronStore = (window as any).electronStore
		return {
			getItem: async (key: string): Promise<string | null> => {
				try {
					const value = await electronStore.get(key)
					return value === undefined ? null : value
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.get error:', e)
					return null
				}
			},
			setItem: async (key: string, value: string): Promise<void> => {
				try {
					await electronStore.set(key, value)
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.set error:', e)
				}
			},
			removeItem: async (key: string): Promise<void> => {
				try {
					await electronStore.delete(key)
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.delete error:', e)
				}
			},
		}
	}
	return localStorage
}

// ── Normalization helpers (shared by hydration + v1 migration) ───────────────

/**
 * Coerce a single profile into the canonical shape:
 *  - ensures settings / favorites / watchHistory exist
 *  - migrates legacy `recentlyWatched` into `watchHistory`
 *  - coerces legacy string playlists into playlist objects
 */
function normalizeProfile(input: any): UserProfile {
	const profile: any = { ...input }

	profile.settings = { ...DEFAULT_SETTINGS, ...(profile.settings || {}) }
	if (!Array.isArray(profile.favorites)) profile.favorites = []
	if (!Array.isArray(profile.watchHistory)) profile.watchHistory = []

	// Migrate legacy recentlyWatched -> watchHistory
	if (Array.isArray(profile.recentlyWatched) && profile.recentlyWatched.length > 0) {
		profile.recentlyWatched.forEach((item: any) => {
			const channelId = typeof item === 'string' ? item : item?.channelId
			const timestamp = typeof item === 'object' && item?.timestamp ? item.timestamp : Date.now()
			const duration = typeof item === 'object' && item?.watchDuration ? item.watchDuration : 0
			if (channelId != null && !profile.watchHistory.some((h: any) => h.channelId === channelId)) {
				profile.watchHistory.push({
					channelId,
					firstWatchedAt: timestamp,
					lastWatchedAt: timestamp,
					totalWatchSeconds: duration,
					sessions: 1,
					averageSessionSeconds: duration,
				})
			}
		})
		delete profile.recentlyWatched
	}

	// Coerce playlists to objects and backfill fields
	if (Array.isArray(profile.playlists) && profile.playlists.length > 0) {
		profile.playlists = profile.playlists.map((p: any, idx: number) => {
			let obj: any = typeof p === 'string'
				? {
						id: nanoid(),
						name: p.substring(p.lastIndexOf('/') + 1) || `Playlist ${idx + 1}`,
						type: 'm3u',
						url: p,
						active: idx === 0,
				  }
				: { ...p }

			if (obj.status === undefined) obj.status = 'ready'
			if (obj.channelCount === undefined) obj.channelCount = 0
			if (obj.lastUpdated === undefined) obj.lastUpdated = Date.now()
			if (obj.createdAt === undefined) obj.createdAt = Date.now()
			if (obj.lastError === undefined) obj.lastError = null
			return obj
		})
	} else {
		profile.playlists = Array.isArray(profile.playlists) ? profile.playlists : []
	}

	return profile as UserProfile
}

/** Ensure at least one profile exists and normalize every profile in the map. */
function normalizeState(s: ProfilesState): Partial<ProfilesState> {
	let profiles = s.profiles && typeof s.profiles === 'object' ? s.profiles : {}
	let activeId = s.activeProfileId

	if (Object.keys(profiles).length === 0) {
		const def = createDefaultProfile()
		profiles = { [def.id]: def }
		activeId = def.id
	}

	const normalized: Record<string, UserProfile> = {}
	for (const id in profiles) normalized[id] = normalizeProfile(profiles[id])

	if (!activeId || !normalized[activeId]) {
		activeId = Object.keys(normalized)[0] ?? null
	}

	return { profiles: normalized, activeProfileId: activeId }
}

/**
 * Reads the legacy `iptv.profiles.v1` payload directly from the storage backend.
 * Handles both persist-envelope (`{ state, version }`) and raw-state shapes, and
 * both the object-schema (.js store) and string-playlist schema (.ts store).
 */
async function readLegacyProfiles(
	key: string
): Promise<{
	profiles: Record<string, any>
	activeProfileId: string | null
	activePlaylistId: string | null
	isPremium: boolean
} | null> {
	let raw: any = null
	try {
		if (typeof window !== 'undefined' && (window as any).electronStore) {
			raw = await (window as any).electronStore.get(key)
		} else if (typeof localStorage !== 'undefined') {
			raw = localStorage.getItem(key)
		}
	} catch (e) {
		console.error('[Matrix_IPTV] Failed to read legacy profiles:', e)
		return null
	}

	if (!raw) return null

	let parsed: any
	try {
		parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
	} catch (e) {
		console.error('[Matrix_IPTV] Failed to parse legacy profiles:', e)
		return null
	}

	const state = parsed && parsed.state ? parsed.state : parsed
	if (!state || typeof state !== 'object') return null

	return {
		profiles: state.profiles && typeof state.profiles === 'object' ? state.profiles : {},
		activeProfileId: state.activeProfileId ?? null,
		activePlaylistId: state.activePlaylistId ?? null,
		isPremium: !!state.isPremium,
	}
}

// Module-captured store handles so the rehydrate bridge can mutate state without
// referencing `useProfilesStore` before it is assigned (important for the
// synchronous localStorage path).
let _set: ((partial: any) => void) | null = null
let _get: (() => ProfilesState) | null = null

export const useProfilesStore = create<ProfilesState>()(
	persist(
		(set, get) => {
			_set = set as any
			_get = get as any

			return {
				profiles: {},
				activeProfileId: null,
				activePlaylistId: null,
				isPremium: false,
				syncStates: {},
				favorites: [],
				isParentalUnlocked: false,

				getActiveProfile: () => {
					const state = get()
					if (!state.activeProfileId) return null
					return state.profiles[state.activeProfileId] ?? null
				},

				getActiveSettings: () => {
					const profile = get().getActiveProfile()
					return profile ? profile.settings : null
				},

				setPremiumStatus: (status) => set({ isPremium: !!status }),

				createProfile: (name) => {
					const id = nanoid()
					const newProfile: UserProfile = {
						id,
						name: name?.trim() || 'New Profile',
						playlists: [],
						favorites: [],
						watchHistory: [],
						settings: { ...DEFAULT_SETTINGS },
					}
					set((state) => ({
						profiles: { ...state.profiles, [id]: newProfile },
						activeProfileId: state.activeProfileId ?? id,
					}))
					return id
				},

				deleteProfile: (profileId) => {
					// Cascade-delete every SQLite playlist owned by this profile BEFORE
					// dropping it from Zustand, so the playlist ids are still available.
					// Fire-and-forget + guarded; must not block profile removal.
					const profile = get().profiles[profileId]
					if (
						profile?.playlists?.length &&
						typeof window !== 'undefined' &&
						(window as any).electronDB
					) {
						for (const p of profile.playlists) {
							if (p?.id) void get().deletePlaylistFromDB(p.id)
						}
					}

					set((state) => {
						const { [profileId]: _removed, ...rest } = state.profiles
						let nextActive = state.activeProfileId
						if (state.activeProfileId === profileId) {
							const remainingIds = Object.keys(rest)
							nextActive = remainingIds[0] ?? null
						}
						return { profiles: rest, activeProfileId: nextActive }
					})
				},

				renameProfile: (profileId, name) => {
					set((state) => {
						const profile = state.profiles[profileId]
						if (!profile) return {}
						return {
							profiles: {
								...state.profiles,
								[profileId]: { ...profile, name: name.trim() || profile.name },
							},
						}
					})
				},

				setActiveProfile: (profileId) => {
					set((state) => ({
						activeProfileId: state.profiles[profileId] ? profileId : state.activeProfileId,
					}))
				},

				updateSettings: (partial) => {
					set((state) => {
						const active = state.activeProfileId
						if (!active) return {}
						const profile = state.profiles[active]
						return {
							profiles: {
								...state.profiles,
								[active]: { ...profile, settings: { ...profile.settings, ...partial } },
							},
						}
					})
				},

				toggleFavorite: (channelId) => {
					set((state) => {
						const active = state.activeProfileId
						if (!active) return {}
						const profile = state.profiles[active]
						const favorites = profile.favorites || []
						const isFav = favorites.includes(channelId)
						return {
							profiles: {
								...state.profiles,
								[active]: {
									...profile,
									favorites: isFav
										? favorites.filter((id) => id !== channelId)
										: [...favorites, channelId],
								},
							},
						}
					})
				},

				updateWatchHistory: (channelId, durationSeconds = 0) => {
					set((state) => {
						const active = state.activeProfileId
						if (!active) return {}
						const profile = state.profiles[active]
						const history = profile.watchHistory || []

						const existingIdx = history.findIndex((item: any) => item.channelId === channelId)

						const updatedHistory = [...history]
						const now = Date.now()

						if (existingIdx >= 0) {
							const current = updatedHistory[existingIdx]
							const newSessions = current.sessions + 1
							const newTotalSeconds = (current.totalWatchSeconds || 0) + durationSeconds
							updatedHistory[existingIdx] = {
								...current,
								lastWatchedAt: now,
								totalWatchSeconds: newTotalSeconds,
								sessions: newSessions,
								averageSessionSeconds: newSessions > 0 ? Math.floor(newTotalSeconds / newSessions) : 0,
							}
						} else {
							updatedHistory.push({
								channelId,
								firstWatchedAt: now,
								lastWatchedAt: now,
								totalWatchSeconds: durationSeconds,
								sessions: 1,
								averageSessionSeconds: durationSeconds,
							})
						}

						return {
							profiles: {
								...state.profiles,
								[active]: { ...profile, watchHistory: updatedHistory },
							},
						}
					})
				},

				addRecentlyWatched: (channelId) => {
					// Backward-compatibility wrapper: new session with 0 duration.
					get().updateWatchHistory(channelId, 0)
				},

				setPlaylists: (playlists) => {
					set((state) => {
						const active = state.activeProfileId
						if (!active) return {}
						const profile = state.profiles[active]
						return {
							profiles: {
								...state.profiles,
								[active]: { ...profile, playlists: [...playlists] },
							},
						}
					})
				},

				addPlaylist: (url) => {
					if (!url || !url.trim()) return
					get().addM3uPlaylist({ name: '', url })
				},

				addM3uPlaylist: (playlistData) => {
					const { name, url, status, channelCount, lastUpdated, lastError } = playlistData
					if (!url || !url.trim()) {
						throw new Error('URL cannot be empty')
					}

					set((state) => {
						const active = state.activeProfileId
						if (!active) return {}
						const profile = state.profiles[active]
						const playlists = profile.playlists || []

						// Prevent duplicate ingestion by url
						const alreadyExists = playlists.some((p) => p.url === url)
						if (alreadyExists) return {}

						// Deactivate other playlists
						const updatedPlaylists = playlists.map((p) => ({ ...p, active: false }))

						const newPlaylist: Playlist = {
							id: nanoid(),
							name: (name || '').trim() || url.substring(url.lastIndexOf('/') + 1) || 'M3U Playlist',
							type: 'm3u',
							url: url,
							active: true,
							status: status || 'ready',
							channelCount: channelCount || 0,
							lastUpdated: lastUpdated || Date.now(),
							lastError: lastError || null,
							createdAt: Date.now(),
						}

						return {
							profiles: {
								...state.profiles,
								[active]: {
									...profile,
									playlists: [...updatedPlaylists, newPlaylist],
								},
							},
						}
					})
				},

				updatePlaylist: (id, updates) => {
					set((state) => {
						const active = state.activeProfileId
						if (!active) return {}
						const profile = state.profiles[active]
						const playlists = profile.playlists || []

						const updatedPlaylists = playlists.map((p) => (p.id === id ? { ...p, ...updates } : p))

						return {
							profiles: {
								...state.profiles,
								[active]: { ...profile, playlists: updatedPlaylists },
							},
						}
					})
				},

				addXtreamPlaylist: async (name, serverUrl, username, password) => {
					const client = new (XtreamClient as any)(serverUrl, username, password)
					// Authenticate credentials. Throws human-readable error on failure.
					await client.authenticate()

					const active = get().activeProfileId
					if (!active) throw new Error('No active profile selected.')

					const newPlaylist: Playlist = {
						id: nanoid(),
						name: (name || '').trim() || `Xtream: ${username}`,
						type: 'xtream',
						serverUrl: client.serverUrl,
						username,
						password,
						active: true,
					}

					set((state) => {
						const profile = state.profiles[active]
						const playlists = profile.playlists || []

						// Prevent duplicate Xtream credentials
						const alreadyExists = playlists.some(
							(p) =>
								p.type === 'xtream' &&
								p.serverUrl === newPlaylist.serverUrl &&
								p.username === newPlaylist.username
						)
						if (alreadyExists) return {}

						const updatedPlaylists = playlists.map((p) => ({ ...p, active: false }))

						return {
							profiles: {
								...state.profiles,
								[active]: {
									...profile,
									playlists: [...updatedPlaylists, newPlaylist],
								},
							},
						}
					})

					return newPlaylist
				},

				removePlaylist: (urlOrId) => {
					// Resolve the actual playlist id (callers may pass id OR url) and
					// cascade-delete its SQLite rows (channels/VOD/series/favorites/
					// locked_categories via ON DELETE CASCADE). deletePlaylistFromDB is
					// guarded + non-fatal and clears activePlaylistId if it was active.
					const active = get().activeProfileId
					const match = active
						? (get().profiles[active]?.playlists || []).find(
								(p) => p.id === urlOrId || p.url === urlOrId
							)
						: undefined
					if (match?.id && typeof window !== 'undefined' && (window as any).electronDB) {
						void get().deletePlaylistFromDB(match.id)
					}

					set((state) => {
						const activeId = state.activeProfileId
						if (!activeId) return {}
						const profile = state.profiles[activeId]
						const playlists = profile.playlists || []

						return {
							profiles: {
								...state.profiles,
								[activeId]: {
									...profile,
									playlists: playlists.filter((p) => p.id !== urlOrId && p.url !== urlOrId),
								},
							},
						}
					})
				},

				// ── Phase 7 SQLite Integration ────────────────────────────────────
				addPlaylistToDB: async (profileId, playlistData) => {
					try {
						// @ts-ignore
						const result = await window.electronDB.addPlaylist({
							profile_id: profileId,
							...playlistData,
						})
						if (!result.success) throw new Error(result.error)
						return result.playlist.id
					} catch (err) {
						console.error('Failed to register playlist in database:', err)
						throw err
					}
				},

				deletePlaylistFromDB: async (playlistId) => {
					try {
						// @ts-ignore
						await window.electronDB.deletePlaylist(playlistId)
						if (get().activePlaylistId === playlistId) {
							set({ activePlaylistId: null })
						}
					} catch (err) {
						console.error('Failed to delete playlist:', err)
					}
				},

				setActivePlaylistInDB: async (playlistId) => {
					try {
						// @ts-ignore
						await window.electronDB.setActivePlaylist({
							profileId: get().activeProfileId,
							playlistId,
						})
						set({ activePlaylistId: playlistId })
					} catch (err) {
						console.error('Failed to change active playlist:', err)
					}
				},

				updateSyncProgress: (playlistId, progressData) => {
					set((state) => ({
						syncStates: {
							...state.syncStates,
							[playlistId]: progressData,
						},
					}))
				},

				// ── Phase 8 Favorites (DB) ────────────────────────────────────────
				setFavorites: (favorites) => {
					set({ favorites })
				},

				toggleFavoriteState: (channelId) => {
					set((state) => {
						const isFav = state.favorites.includes(channelId)
						return {
							favorites: isFav
								? state.favorites.filter((id) => id !== channelId)
								: [...state.favorites, channelId],
						}
					})
				},

				toggleFavoriteInDB: async (playlistId, channelId) => {
					try {
						// Optimistic UI update
						get().toggleFavoriteState(channelId)
						// @ts-ignore
						const result = await window.electronDB.toggleFavorite(playlistId, channelId)
						if (!result.success) {
							// Revert on failure
							get().toggleFavoriteState(channelId)
							throw new Error(result.error)
						}
					} catch (err) {
						console.error('Failed to toggle favorite in database:', err)
					}
				},

				loadFavoritesFromDB: async (playlistId) => {
					try {
						// @ts-ignore
						const favorites = await window.electronDB.getFavorites(playlistId)
						set({ favorites: favorites.map((f: any) => f.id) })
					} catch (err) {
						console.error('Failed to load favorites from database:', err)
					}
				},

				// ── Phase 9 Parental Control ──────────────────────────────────────
				setParentalPin: async (pin) => {
					const hashedPin = await hashPin(pin)
					get().updateSettings({ parentalPin: hashedPin })
					set({ isParentalUnlocked: true })
				},

				verifyParentalPin: async (pin) => {
					const settings = get().getActiveSettings()
					if (!settings?.parentalPin) return false
					const hashedPin = await hashPin(pin)
					return hashedPin === settings.parentalPin
				},

				unlockParental: async (pin) => {
					const isValid = await get().verifyParentalPin(pin)
					if (isValid) {
						set({ isParentalUnlocked: true })
						return true
					}
					return false
				},

				lockParental: () => {
					set({ isParentalUnlocked: false })
				},

				toggleCategoryLockInDB: async (playlistId, groupTitle) => {
					try {
						// @ts-ignore
						const lockedCats = await window.electronDB.getLockedCategories(playlistId)
						const isLocked = lockedCats.includes(groupTitle)
						if (isLocked) {
							// @ts-ignore
							await window.electronDB.removeLockedCategory(playlistId, groupTitle)
						} else {
							// @ts-ignore
							await window.electronDB.addLockedCategory(playlistId, groupTitle)
						}
					} catch (err) {
						console.error('Failed to toggle category lock in database:', err)
					}
				},
			}
		},
		{
			name: STORAGE_KEY,
			storage: createJSONStorage(getStorage),
			version: 2,
			// Only persist durable profile data. Session/derived/volatile fields
			// (isParentalUnlocked, syncStates, DB favorites) are intentionally omitted.
			partialize: (state) => ({
				profiles: state.profiles,
				activeProfileId: state.activeProfileId,
				activePlaylistId: state.activePlaylistId,
				isPremium: state.isPremium,
			}),
			// Same-key version bumps (v2 -> v3 in the future) pass through untouched.
			// The v1 -> v2 bridge is handled in onRehydrateStorage because the key changed.
			migrate: (persisted) => persisted as any,
			onRehydrateStorage: () => {
				console.log('[Matrix_IPTV] Rehydrating profile store (v2)...')
				return async (_hydrated, error) => {
					if (error) {
						console.error('[Matrix_IPTV] Profile hydration error:', error)
					}
					if (!_set || !_get) return

					// 1. If v2 has no profiles, import from legacy v1 (non-destructive).
					const current = _get()
					const hasProfiles =
						current.profiles && Object.keys(current.profiles).length > 0

					if (!hasProfiles) {
						const legacy = await readLegacyProfiles(OLD_STORAGE_KEY)
						if (legacy && Object.keys(legacy.profiles).length > 0) {
							console.log(
								`[Matrix_IPTV] Migrating ${Object.keys(legacy.profiles).length} profile(s) from ${OLD_STORAGE_KEY} -> ${STORAGE_KEY}.`
							)
							_set({
								profiles: legacy.profiles,
								activeProfileId: legacy.activeProfileId,
								activePlaylistId: legacy.activePlaylistId,
								isPremium: legacy.isPremium,
							})
						}
					}

					// 2. Ensure a default profile exists and normalize every profile
					//    (favorites, watchHistory, playlist objects, settings backfill).
					_set((s: ProfilesState) => normalizeState(s))
				}
			},
		}
	)
)

// Convenience hooks
export const useActiveProfile = () => useProfilesStore((s) => s.getActiveProfile())
export const useActiveSettings = () => useProfilesStore((s) => s.getActiveSettings())
