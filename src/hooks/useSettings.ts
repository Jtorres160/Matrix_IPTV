import { useMemo } from 'react'
import { useProfilesStore, useActiveSettings, type PlayerPreference, type ThemeMode } from '../store/profileStore'

export type UseSettings = {
	settings: {
		theme: ThemeMode
		playerPreference: PlayerPreference
		autoRefresh: boolean
	}
	setTheme: (theme: ThemeMode) => void
	setPlayerPreference: (pref: PlayerPreference) => void
	setAutoRefresh: (value: boolean) => void
}

export function useSettings(): UseSettings {
	const updateSettings = useProfilesStore((s) => s.updateSettings)
	const settings = useActiveSettings()

    // --- THIS IS THE CHANGE (Part 1) ---
	// We memoize safeSettings itself, so it's a stable object
	const safeSettings = useMemo(() => (
		settings ?? {
			theme: 'system' as ThemeMode,
			playerPreference: 'internal' as PlayerPreference,
			autoRefresh: false,
		}
	), [settings]) // It only updates when the store's settings change
    // --- END OF CHANGE ---

	return useMemo(
		() => ({
			settings: safeSettings,
			setTheme: (theme: ThemeMode) => updateSettings({ theme }),
			setPlayerPreference: (pref: PlayerPreference) => updateSettings({ playerPreference: pref }),
			setAutoRefresh: (value: boolean) => updateSettings({ autoRefresh: value }),
		}),
        // --- THIS IS THE CHANGE (Part 2) ---
		// We now use the stable safeSettings object as the dependency
		[safeSettings, updateSettings]
        // --- END OF CHANGE ---
	)
}