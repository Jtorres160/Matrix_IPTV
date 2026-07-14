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
}

const DEFAULT_SETTINGS: ProfileSettings = {
	theme: 'system',
	playerPreference: 'internal',
	autoRefresh: false,
}

// --- DELETED generateId() ---

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