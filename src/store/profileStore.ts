import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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

function generateId() {
	return Math.random().toString(36).slice(2, 10)
}

const createDefaultProfile = (): UserProfile => ({
	id: generateId(),
	name: 'Default',
	playlists: [],
	settings: { ...DEFAULT_SETTINGS },
})

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
				const id = generateId()
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
			storage: createJSONStorage(() => localStorage),
			version: 1,
			onRehydrateStorage: () => (state) => {
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


