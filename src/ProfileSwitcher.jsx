import React, { useState } from 'react'
import { useProfilesStore } from './profileStore.js'

export default function ProfileSwitcher({ className }) {
	const profiles = useProfilesStore((s) => s.profiles)
	const activeProfileId = useProfilesStore((s) => s.activeProfileId)
	const setActiveProfile = useProfilesStore((s) => s.setActiveProfile)
	const createProfile = useProfilesStore((s) => s.createProfile)
	const renameProfile = useProfilesStore((s) => s.renameProfile)
	const deleteProfile = useProfilesStore((s) => s.deleteProfile)

	const [creating, setCreating] = useState(false)
	const [newName, setNewName] = useState('')
	const [renamingId, setRenamingId] = useState(null)
	const [renameValue, setRenameValue] = useState('')

	const profileEntries = Object.values(profiles)

	return (
		<div className={className}>
		<label className="block text-xs font-semibold mb-1">Profile</label>
		<div className="flex items-center gap-2">
		<select
		value={activeProfileId || ''}
		onChange={(e) => setActiveProfile(e.target.value)}
		className="w-full rounded border border-gray-600 bg-transparent px-2 py-1 text-sm"
		>
		{profileEntries.map((p) => (
			<option key={p.id} value={p.id}>
			{p.name}
			</option>
		))}
		</select>
		</div>

		<div className="mt-2 flex gap-2">
		<button onClick={() => setCreating(true)} className="rounded border px-2 py-1 text-xs hover:bg-[#123234]">New</button>
		{activeProfileId && (
			<button
			onClick={() => {
				setRenamingId(activeProfileId)
				setRenameValue(profiles[activeProfileId].name)
			}}
			className="rounded border px-2 py-1 text-xs hover:bg-[#123234]"
			>
			Rename
			</button>
		)}
		{activeProfileId && profileEntries.length > 1 && (
			<button onClick={() => deleteProfile(activeProfileId)} className="rounded border px-2 py-1 text-xs text-red-400 hover:bg-red-900/30">Delete</button>
		)}
		</div>

		{creating && (
			<div className="mt-2 flex gap-2">
			<input
			value={newName}
			onChange={(e) => setNewName(e.target.value)}
			placeholder="Profile name"
			className="w-full rounded border border-gray-600 bg-transparent px-2 py-1 text-sm"
			/>
			<button
			onClick={() => {
				const id = createProfile(newName)
				setActiveProfile(id)
				setNewName('')
				setCreating(false)
			}}
			className="rounded border px-3 py-1 text-sm hover:bg-[#123234]"
			>
			Create
			</button>
			<button onClick={() => setCreating(false)} className="rounded border px-3 py-1 text-sm hover:bg-[#123234]">Cancel</button>
			</div>
		)}

		{renamingId && (
			<div className="mt-2 flex gap-2">
			<input
			value={renameValue}
			onChange={(e) => setRenameValue(e.target.value)}
			className="w-full rounded border border-gray-600 bg-transparent px-2 py-1 text-sm"
			/>
			<button
			onClick={() => {
				if (renamingId) renameProfile(renamingId, renameValue)
					setRenamingId(null)
			}}
			className="rounded border px-3 py-1 text-sm hover:bg-[#123234]"
			>
			Save
			</button>
			<button onClick={() => setRenamingId(null)} className="rounded border px-3 py-1 text-sm hover:bg-[#123234]">Cancel</button>
			</div>
		)}
		</div>
	)
}
