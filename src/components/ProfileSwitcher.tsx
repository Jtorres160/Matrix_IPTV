import { useState } from 'react'
import { useProfilesStore } from '../store/profileStore'

type Props = {
	className?: string
}

export default function ProfileSwitcher({ className }: Props) {
	const profiles = useProfilesStore((s) => s.profiles)
	const activeProfileId = useProfilesStore((s) => s.activeProfileId)
	const setActiveProfile = useProfilesStore((s) => s.setActiveProfile)
	const createProfile = useProfilesStore((s) => s.createProfile)
	const renameProfile = useProfilesStore((s) => s.renameProfile)
	const deleteProfile = useProfilesStore((s) => s.deleteProfile)

	const [creating, setCreating] = useState(false)
	const [newName, setNewName] = useState('')
	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [renameValue, setRenameValue] = useState('')

	const profileEntries = Object.values(profiles)

	return (
		<div className={className}>
			<label className="block text-sm font-medium mb-1">Profile</label>
			<div className="flex items-center gap-2">
				<select
					value={activeProfileId ?? ''}
					onChange={(e) => setActiveProfile(e.target.value)}
					className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
				>
					{profileEntries.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
			</div>

			<div className="mt-2 flex gap-2">
				<button
					onClick={() => setCreating(true)}
					className="rounded-md border px-2 py-1 text-sm hover:bg-accent"
				>
					New
				</button>
				{activeProfileId && (
					<button
						onClick={() => {
							setRenamingId(activeProfileId)
							setRenameValue(profiles[activeProfileId].name)
						}}
						className="rounded-md border px-2 py-1 text-sm hover:bg-accent"
					>
						Rename
					</button>
				)}
				{activeProfileId && profileEntries.length > 1 && (
					<button
						onClick={() => deleteProfile(activeProfileId)}
						className="rounded-md border px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
					>
						Delete
					</button>
				)}
			</div>

			{creating && (
				<div className="mt-2 flex gap-2">
					<input
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="Profile name"
						className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<button
						onClick={() => {
							const id = createProfile(newName)
							setActiveProfile(id)
							setNewName('')
							setCreating(false)
						}}
						className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
					>
						Create
					</button>
					<button onClick={() => setCreating(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
						Cancel
					</button>
				</div>
			)}

			{renamingId && (
				<div className="mt-2 flex gap-2">
					<input
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<button
						onClick={() => {
							if (renamingId) renameProfile(renamingId, renameValue)
							setRenamingId(null)
						}}
						className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
					>
						Save
					</button>
					<button onClick={() => setRenamingId(null)} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
						Cancel
					</button>
				</div>
			)}
		</div>
	)
}


