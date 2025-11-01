import React from 'react'
import { useActiveProfile } from './profileStore.js' // <-- Note the path update

export default function Sidebar({ className, categories, activeCategory, onSelectCategory, onOpenSettings }) {
	const profile = useActiveProfile()

	return (
		<aside className={`flex h-full w-64 flex-col border-r ${className ?? ''} bg-[#0e2a2d] text-gray-200`}>
		<div className="p-3 border-b border-gray-700">
		{profile && (
			<p className="text-sm font-semibold">Active: {profile.name}</p>
		)}
		</div>

		<div className="mt-2 flex-1 overflow-auto">
		<ul className="px-2 py-1">
		{/* Placeholder content for categories or features */}
		<li className="p-2 text-xs text-gray-400">Categories will load here...</li>
		</ul>
		</div>

		<nav className="flex flex-col gap-3 p-4 border-t border-gray-700">
		<button className="hover:text-white text-left text-sm" onClick={onOpenSettings}>
		⚙️ Settings
		</button>
		</nav>
		</aside>
	)
}
