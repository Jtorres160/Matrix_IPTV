import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import XtreamClient from './services/xtreamClient.js'

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
		favorites: [],
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
			isPremium: false,

			setPremiumStatus: (status) => set({ isPremium: !!status }),

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
					favorites: [],
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

			// Keep addPlaylist wrapper for backward compatibility
			addPlaylist: (url) => {
				get().addM3uPlaylist(url.substring(url.lastIndexOf('/') + 1) || "M3U Playlist", url);
			},

			addM3uPlaylist: (name, url) => {
				if (!url || !url.trim()) {
					throw new Error("URL cannot be empty");
				}

				set((state) => {
					const active = state.activeProfileId
					if (!active) return {}
					const profile = state.profiles[active]
					const playlists = profile.playlists || []
					
					// Edge Case: Check for duplicates by url to prevent duplicate ingestion
					const alreadyExists = playlists.some(p => p.url === url);
					if (alreadyExists) return {}

					// Deactivate other playlists
					const updatedPlaylists = playlists.map(p => ({ ...p, active: false }));

					const newPlaylist = {
						id: nanoid(),
						name: (name || '').trim() || url.substring(url.lastIndexOf('/') + 1) || "M3U Playlist",
						type: 'm3u',
						url: url,
						active: true
					};

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

			addXtreamPlaylist: async (name, serverUrl, username, password) => {
				const client = new XtreamClient(serverUrl, username, password);
				// Authenticate credentials. Throws human-readable error on failure.
				await client.authenticate();

				const active = get().activeProfileId;
				if (!active) throw new Error("No active profile selected.");

				const newPlaylist = {
					id: nanoid(),
					name: (name || '').trim() || `Xtream: ${username}`,
					type: 'xtream',
					serverUrl: client.serverUrl,
					username,
					password,
					active: true
				};

				set((state) => {
					const profile = state.profiles[active];
					const playlists = profile.playlists || [];

					// Edge Case: Check for duplicate Xtream credentials
					const alreadyExists = playlists.some(
						p => p.type === 'xtream' &&
							p.serverUrl === newPlaylist.serverUrl &&
							p.username === newPlaylist.username
					);
					if (alreadyExists) return {};

					// Deactivate other playlists
					const updatedPlaylists = playlists.map(p => ({ ...p, active: false }));

					return {
						profiles: {
							...state.profiles,
							[active]: {
								...profile,
								playlists: [...updatedPlaylists, newPlaylist]
							}
						}
					};
				});

				return newPlaylist;
			},

			toggleFavorite: (streamId) => {
				if (!streamId) return;
				set((state) => {
					const active = state.activeProfileId
					if (!active) return {}
					const profile = state.profiles[active]
					const favorites = profile.favorites || []
					const isFav = favorites.includes(streamId)

					const nextFavorites = isFav
						? favorites.filter(id => id !== streamId)
						: [...favorites, streamId]

					return {
						profiles: {
							...state.profiles,
							[active]: {
								...profile,
								favorites: nextFavorites
							}
						}
					}
				})
			},

			removePlaylist: (urlOrId) => {
				set((state) => {
					const active = state.activeProfileId
					if (!active) return {}
					const profile = state.profiles[active]
					const playlists = profile.playlists || []

					return {
						profiles: {
							...state.profiles,
							[active]: {
								...profile,
								playlists: playlists.filter((p) => p.id !== urlOrId && p.url !== urlOrId),
							},
						},
					}
				})
			},
		}),
		{
			name: 'iptv.profiles.v1',
			storage: createJSONStorage(getStorage),
			onFinishHydration: (state, set, get) => {
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

					// Ensure favorites exists and migrate playlists to objects
					const updatedProfiles = { ...nextProfiles };
					for (const id in updatedProfiles) {
						if (!updatedProfiles[id].favorites) {
							updatedProfiles[id].favorites = [];
						}
						if (updatedProfiles[id].playlists && updatedProfiles[id].playlists.length > 0) {
							const migratedPlaylists = updatedProfiles[id].playlists.map((p, idx) => {
								if (typeof p === 'string') {
									return {
										id: nanoid(),
										name: p.substring(p.lastIndexOf('/') + 1) || `Playlist ${idx + 1}`,
										type: 'm3u',
										url: p,
										active: idx === 0
									};
								}
								return p;
							});
							updatedProfiles[id].playlists = migratedPlaylists;
						}
					}

					return { 
						profiles: updatedProfiles, 
						activeProfileId: nextActive 
					};
				})
			},
		}
	)
)

export const useActiveProfile = () => useProfilesStore((s) => s.getActiveProfile())
export const useActiveSettings = () => useProfilesStore((s) => s.getActiveSettings())