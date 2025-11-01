import { useMemo } from 'react'
// Note: Changed path from '../store/profileStore' to './profileStore.js'
import { useProfilesStore, useActiveSettings } from './profileStore.js'

// This hook manages reading and writing to the active profile's settings
export function useSettings() {
	const updateSettings = useProfilesStore((s) => s.updateSettings)
	const settings = useActiveSettings()

	const safeSettings = useMemo(() => (
		settings ?? {
			theme: 'system',
			playerPreference: 'internal',
			autoRefresh: false,
		}
	), [settings])

	return useMemo(
		() => ({
			settings: safeSettings,
			setTheme: (theme) => updateSettings({ theme }),
			   setPlayerPreference: (pref) => updateSettings({ playerPreference: pref }),
			   setAutoRefresh: (value) => updateSettings({ autoRefresh: value }),
		}),
		[safeSettings, updateSettings]
	)
}
