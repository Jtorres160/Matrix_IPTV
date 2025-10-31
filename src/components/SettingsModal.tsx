import ProfileSwitcher from './ProfileSwitcher'
import { useSettings } from '../hooks/useSettings'

type Props = {
	open: boolean
	onClose: () => void
}

export default function SettingsModal({ open, onClose }: Props) {
	const { settings, setTheme, setPlayerPreference, setAutoRefresh } = useSettings()

	if (!open) return null

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<div className="absolute inset-0 bg-black/50" onClick={onClose} />
			<div className="relative z-10 w-full max-w-lg rounded-lg border bg-background p-4 shadow-lg">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-lg font-semibold">Settings</h2>
					<button onClick={onClose} className="rounded-md border px-2 py-1 text-sm hover:bg-accent">
						Close
					</button>
				</div>

				<div className="space-y-6">
					<section>
						<ProfileSwitcher />
					</section>

					<section>
						<label className="mb-1 block text-sm font-medium">Theme</label>
						<select
							value={settings.theme}
							onChange={(e) => setTheme(e.target.value as any)}
							className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
						>
							<option value="system">System</option>
							<option value="light">Light</option>
							<option value="dark">Dark</option>
						</select>
					</section>

					<section>
						<label className="mb-1 block text-sm font-medium">Player</label>
						<select
							value={settings.playerPreference}
							onChange={(e) => setPlayerPreference(e.target.value as any)}
							className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
						>
							<option value="internal">Internal</option>
							<option value="vlc">VLC</option>
						</select>
					</section>

					<section className="flex items-center justify-between">
						<div>
							<label className="block text-sm font-medium">Auto-refresh</label>
							<p className="text-xs text-muted-foreground">Refresh every 60s</p>
						</div>
						<input
							type="checkbox"
							checked={settings.autoRefresh}
							onChange={(e) => setAutoRefresh(e.target.checked)}
							className="h-5 w-5"
						/>
					</section>
				</div>
			</div>
		</div>
	)
}


