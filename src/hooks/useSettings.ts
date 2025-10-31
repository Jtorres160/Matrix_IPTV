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

	const safeSettings = settings ?? {
		theme: 'system' as ThemeMode,
		playerPreference: 'internal' as PlayerPreference,
		autoRefresh: false,
	}

	return useMemo(
		() => ({
			settings: safeSettings,
			setTheme: (theme: ThemeMode) => updateSettings({ theme }),
			setPlayerPreference: (pref: PlayerPreference) => updateSettings({ playerPreference: pref }),
			setAutoRefresh: (value: boolean) => updateSettings({ autoRefresh: value }),
		}),
		[JSON.stringify(safeSettings), updateSettings]
	)
}


