import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const DEFAULT_SETTINGS = {
	theme: 'dark',
	playerPreference: 'internal',
	autoRefresh: false,
}

function generateId() {
	return Math.random().toString(36).slice(2, 10)
}

function createDefaultProfile() {
	return {
		id: generateId(),
		name: 'Default',
		playlists: [],
		settings: { ...DEFAULT_SETTINGS },
	}
}

// Check if we're in Electron (window.electronStore) or a regular browser
const getStorage = () => {
	if (window.electronStore) {
		// Use the native file-based storage in Electron
		return window.electronStore
	}
	// Fallback to localStorage for web/browser version
	return localStorage
}

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
				const id = generateId()
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
		 // Use the new dynamic storage getter
		 storage: createJSONStorage(getStorage),
			onRehydrateStorage: () => (set, get) => {
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
export const useActiveSettings = () => useProfilesStore((s) => s.getActiveSettings())
