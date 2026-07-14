import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { nanoid } from 'nanoid' // <-- Import nanoid

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
}

export type UserProfile = {
	id: string
	name: string
	/** M3U or remote playlist URLs for this profile */
	playlists: string[]
	settings: ProfileSettings
}

type ProfilesState = {
	profiles: Record<string, UserProfile>
	activeProfileId: string | null
	activePlaylistId: string | null
	syncStates: Record<string, any>
	favorites: number[] // IDs of favorite channels for the active playlist

	// Derived selectors
	getActiveProfile: () => UserProfile | null
	getActiveSettings: () => ProfileSettings | null

	// Mutations
	createProfile: (name: string) => string
	deleteProfile: (profileId: string) => void
	renameProfile: (profileId: string, name: string) => void
	setActiveProfile: (profileId: string) => void
	updateSettings: (partial: Partial<ProfileSettings>) => void
	setPlaylists: (playlists: string[]) => void
	addPlaylist: (url: string) => void
	removePlaylist: (url: string) => void

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
	isParentalUnlocked: boolean
	setParentalPin: (pin: string) => Promise<void>
	verifyParentalPin: (pin: string) => Promise<boolean>
	unlockParental: (pin: string) => Promise<boolean>
	lockParental: () => void
	toggleCategoryLockInDB: (playlistId: string, groupTitle: string) => Promise<void>
}

const DEFAULT_SETTINGS: ProfileSettings = {
	theme: 'system',
	playerPreference: 'internal',
	autoRefresh: false,
	epgScale: 'normal',
	colorOverlay: 'semi-transparent',
	channelColumnWidth: 300,
	tmdbApiKey: '',
}

// --- DELETED generateId() ---

// --- Helper: PIN Hashing ---
async function hashPin(pin: string): Promise<string> {
	const msgUint8 = new TextEncoder().encode(pin);
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const createDefaultProfile = (): UserProfile => ({
	id: nanoid(), // <-- Use nanoid
	name: 'Default',
	playlists: [],
	settings: { ...DEFAULT_SETTINGS },
})

// --- *** THIS IS THE FIX (Part 1) *** ---
// Re-added the async storage function
// This uses electronStore if available, otherwise falls back to localStorage
const getStorage = () => {
	if (typeof window !== 'undefined' && window.electronStore) {
		// Use the native file-based storage in Electron
		return {
			getItem: async (key: string): Promise<string | null> => {
				try {
					const value = await window.electronStore.get(key);
					// Zustand's persist middleware expects 'null' for a missing key
					return value === undefined ? null : value;
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.get error:', e);
					return null;
				}
			},
			setItem: async (key: string, value: string): Promise<void> => {
				try {
					await window.electronStore.set(key, value);
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.set error:', e);
				}
			},
			removeItem: async (key: string): Promise<void> => {
				try {
					await window.electronStore.delete(key);
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.delete error:', e);
				}
			}
		};
	}
	// Fallback to localStorage for web/browser version
	return localStorage;
};
// --- *** END OF FIX *** ---


export const useProfilesStore = create<ProfilesState>()(
	persist(
		(set, get) => ({
			profiles: {},
			activeProfileId: null,
			activePlaylistId: null,
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

			createProfile: (name: string) => {
				const id = nanoid() // <-- Use nanoid
				const newProfile: UserProfile = {
					id,
					name: name?.trim() || 'New Profile',
					playlists: [],
					settings: { ...DEFAULT_SETTINGS },
				}
				set((state) => ({
					profiles: { ...state.profiles, [id]: newProfile },
					activeProfileId: state.activeProfileId ?? id,
				}))
				return id
			},

			deleteProfile: (profileId: string) => {
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

			renameProfile: (profileId: string, name: string) => {
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

			setActiveProfile: (profileId: string) => {
				set((state) => ({
					activeProfileId: state.profiles[profileId] ? profileId : state.activeProfileId,
				}))
			},

			updateSettings: (partial: Partial<ProfileSettings>) => {
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

			setPlaylists: (playlists: string[]) => {
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

			addPlaylist: (url: string) => {
				set((state) => {
					const active = state.activeProfileId
					if (!active) return {}
					const profile = state.profiles[active]
					if (profile.playlists.includes(url)) return {}
					return {
						profiles: {
							...state.profiles,
							[active]: { ...profile, playlists: [...profile.playlists, url] },
						},
					}
				})
			},

			removePlaylist: (url: string) => {
				set((state) => {
					const active = state.activeProfileId
					if (!active) return {}
					const profile = state.profiles[active]
					return {
						profiles: {
							...state.profiles,
							[active]: { ...profile, playlists: profile.playlists.filter((u) => u !== url) },
						},
					}
				})
			},

			// --- Additions for Phase 7 SQLite Integration ---
			
			// Registers a playlist in the DB and triggers Main Process sync
			addPlaylistToDB: async (profileId: string, playlistData: any) => {
				try {
					// @ts-ignore
					const result = await window.electronDB.addPlaylist({
						profile_id: profileId,
						...playlistData
					});
					if (!result.success) throw new Error(result.error);
					return result.playlist.id;
				} catch (err) {
					console.error('Failed to register playlist in database:', err);
					throw err;
				}
			},

			// Deletes playlist from DB and handles store fallback
			deletePlaylistFromDB: async (playlistId: string) => {
				try {
					// @ts-ignore
					await window.electronDB.deletePlaylist(playlistId);
					if (get().activePlaylistId === playlistId) {
						set({ activePlaylistId: null });
					}
				} catch (err) {
					console.error('Failed to delete playlist:', err);
				}
			},

			// Updates active state across DB entries and in the Zustand store
			setActivePlaylistInDB: async (playlistId: string) => {
				try {
					// @ts-ignore
					await window.electronDB.setActivePlaylist({
						profileId: get().activeProfileId,
						playlistId
					});
					set({ activePlaylistId: playlistId });
				} catch (err) {
					console.error('Failed to change active playlist:', err);
				}
			},

			// Receives and commits background progress updates to the UI thread
			updateSyncProgress: (playlistId: string, progressData: any) => {
				set((state) => ({
					syncStates: {
						...state.syncStates,
						[playlistId]: progressData
					}
				}));
			},

			// --- Additions for Phase 8 Favorites ---

			setFavorites: (favorites: number[]) => {
				set({ favorites });
			},

			toggleFavoriteState: (channelId: number) => {
				set((state) => {
					const isFav = state.favorites.includes(channelId);
					return {
						favorites: isFav 
							? state.favorites.filter(id => id !== channelId)
							: [...state.favorites, channelId]
					};
				});
			},

			toggleFavoriteInDB: async (playlistId: string, channelId: number) => {
				try {
					// Optimistic UI update
					get().toggleFavoriteState(channelId);
					// @ts-ignore
					const result = await window.electronDB.toggleFavorite(playlistId, channelId);
					if (!result.success) {
						// Revert on failure
						get().toggleFavoriteState(channelId);
						throw new Error(result.error);
					}
				} catch (err) {
					console.error('Failed to toggle favorite in database:', err);
				}
			},

			loadFavoritesFromDB: async (playlistId: string) => {
				try {
					// @ts-ignore
					const favorites = await window.electronDB.getFavorites(playlistId);
					set({ favorites: favorites.map((f: any) => f.id) });
				} catch (err) {
					console.error('Failed to load favorites from database:', err);
				}
			},

			// --- Additions for Phase 9 Parental Control ---

			setParentalPin: async (pin: string) => {
				const hashedPin = await hashPin(pin);
				get().updateSettings({ parentalPin: hashedPin });
				// Automatically unlock the session when setting a new PIN
				set({ isParentalUnlocked: true });
			},

			verifyParentalPin: async (pin: string) => {
				const settings = get().getActiveSettings();
				if (!settings?.parentalPin) return false;
				const hashedPin = await hashPin(pin);
				return hashedPin === settings.parentalPin;
			},

			unlockParental: async (pin: string) => {
				const isValid = await get().verifyParentalPin(pin);
				if (isValid) {
					set({ isParentalUnlocked: true });
					return true;
				}
				return false;
			},

			lockParental: () => {
				set({ isParentalUnlocked: false });
			},

			toggleCategoryLockInDB: async (playlistId: string, groupTitle: string) => {
				try {
					// @ts-ignore
					const lockedCats = await window.electronDB.getLockedCategories(playlistId);
					const isLocked = lockedCats.includes(groupTitle);
					if (isLocked) {
						// @ts-ignore
						await window.electronDB.removeLockedCategory(playlistId, groupTitle);
					} else {
						// @ts-ignore
						await window.electronDB.addLockedCategory(playlistId, groupTitle);
					}
				} catch (err) {
					console.error('Failed to toggle category lock in database:', err);
				}
			}
		}),
		{
			name: 'iptv.profiles.v1',
			// --- *** THIS IS THE FIX (Part 2) *** ---
			storage: createJSONStorage(getStorage), // Use our new async storage
			version: 1,
			// Use onFinishHydration for async storage
			onFinishHydration: () => {
			// --- *** END OF FIX *** ---
				console.log('[Matrix_IPTV] Rehydrating profile store from disk...');
				// Ensure at least one profile exists after hydration
				set((s) => {
					let nextProfiles = s.profiles
					let nextActive = s.activeProfileId
					if (!nextProfiles || Object.keys(nextProfiles).length === 0) {
						const def = createDefaultProfile()
						nextProfiles = { [def.id]: def }
						nextActive = def.id
					}
					if (!nextActive) {
						nextActive = Object.keys(nextProfiles)[0]
					}
					return { profiles: nextProfiles, activeProfileId: nextActive }
				})
			},
		}
	)
)

// Convenience hooks
export const useActiveProfile = () => useProfilesStore((s) => s.getActiveProfile())
export const useActiveSettings = () => useProfilesStore((s) => s.getActiveSettings())