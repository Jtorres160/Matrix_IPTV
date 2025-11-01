import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { nanoid } from 'nanoid'

const DEFAULT_SETTINGS = {
	theme: 'dark',
	playerPreference: 'internal',
	autoRefresh: false,
}

function createDefaultProfile() {
	return {
		id: nanoid(),
		name: 'Default',
		playlists: [],
		settings: { ...DEFAULT_SETTINGS },
	}
}

const getStorage = () => {
	if (typeof window !== 'undefined' && window.electronStore) {
		return {
			getItem: async (key) => {
				try {
					const value = await window.electronStore.get(key);
					return value === undefined ? null : value;
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.get error:', e);
					return null;
				}
			},
			setItem: async (key, value) => {
				try {
					await window.electronStore.set(key, value);
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.set error:', e);
				}
			},
			removeItem: async (key) => {
				try {
					await window.electronStore.delete(key);
				} catch (e) {
					console.error('[Matrix_IPTV] electronStore.delete error:', e);
				}
			}
		};
	}
	return localStorage;
};

export const useProfilesStore = create(
	persist(
		(set, get) => ({
			profiles: {},
			activeProfileId: null,

			getActiveProfile: () => {
				const s = get()
				return s.activeProfileId ? s.profiles[s.activeProfileId] || null : null
			},
			getActiveSettings: () => {
				const p = get().getActiveProfile()
				return p ? p.settings : null
			},

			createProfile: (name) => {
				const id = nanoid()
				const newProfile = {
					id,
					name: (name || '').trim() || 'New Profile',
					   playlists: [],
					   settings: { ...DEFAULT_SETTINGS },
				}
				set((state) => ({
					profiles: { ...state.profiles, [id]: newProfile },
					activeProfileId: state.activeProfileId ?? id,
				}))
				return id
			},

			deleteProfile: (profileId) => {
				set((state) => {
					const { [profileId]: _removed, ...rest } = state.profiles
					let nextActive = state.activeProfileId
					if (state.activeProfileId === profileId) {
						const remainingIds = Object.keys(rest)
						nextActive = remainingIds[0] || null
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
							[profileId]: { ...profile, name: (name || '').trim() || profile.name },
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

			addPlaylist: (url) => {
				set((state) => {
					const active = state.activeProfileId
					if (!active) return {}
					const profile = state.profiles[active]
					if (profile.playlists.includes(url)) return {}

					return {
						profiles: {
							...state.profiles,
							[active]: {
								...profile,
								playlists: [...profile.playlists, url],
							},
						},
					}
				})
			},

			removePlaylist: (url) => {
				set((state) => {
					const active = state.activeProfileId
					if (!active) return {}
					const profile = state.profiles[active]

					return {
						profiles: {
							...state.profiles,
							[active]: {
								...profile,
								playlists: profile.playlists.filter((p) => p !== url),
							},
						},
					}
				})
			},
		}),
		 {
			 name: 'iptv.profiles.v1',
		 	 storage: createJSONStorage(getStorage),
             // --- *** THIS IS THE FIX *** ---
             // Changed 'onRehydrateStorage' to 'onFinishHydration'
             // This function is called AFTER async storage is loaded
             // and correctly provides the 'set' function.
			 onFinishHydration: (state, set, get) => {
             // --- *** END OF FIX *** ---
                console.log('[Matrix_IPTV] Rehydrating profile store from disk...');
				// ensure at least one profile
				set((s) => {
					let nextProfiles = s.profiles
					let nextActive = s.activeProfileId
					if (!nextProfiles || Object.keys(nextProfiles).length === 0) {
						const def = createDefaultProfile()
						nextProfiles = { [def.id]: def }
						nextActive = def.id
					}
					if (!nextActive) nextActive = Object.keys(nextProfiles)[0]
						return { profiles: nextProfiles, activeProfileId: nextActive }
				})
			},
		 }
	)
)

export const useActiveProfile = () => useProfilesStore((s) => s.getActiveProfile())
<<<<<<< HEAD
export const useActiveSettings = () => useProfilesStore((s) => s.getActiveSettings())
=======
export const useActiveSettings = () => useProfilesStore((s) => s.getActiveSettings())
>>>>>>> 33ff4b7b5e069dc9bfdbb7ab39b6459b40717f1b
