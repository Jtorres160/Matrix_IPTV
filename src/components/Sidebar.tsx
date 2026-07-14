import { useActiveProfile } from '../store/profileStore'

type Props = {
	className?: string
	// Existing sidebar may pass categories, onSelectCategory, etc.
	categories?: string[]
	activeCategory?: string | null
	onSelectCategory?: (c: string | null) => void
}

export default function Sidebar({ className, categories, activeCategory, onSelectCategory }: Props) {
	const profile = useActiveProfile()

	return (
		<aside className={`flex h-full w-64 flex-col border-r ${className ?? ''}`}>
			{/* ProfileSwitcher component removed from here */}
			<div className="p-3">
				{profile && (
					<p className="mt-2 text-xs text-muted-foreground">Active: {profile.name}</p>
				)}
			</div>
			<div className="mt-2 flex-1 overflow-auto">
				<ul className="px-2 py-1">
					{categories?.map((c) => (
						<li key={c}>
							<button
								onClick={() => onSelectCategory?.(c)}
								className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${
									activeCategory === c ? 'bg-accent' : ''
								}`}
							>
								{c}
							</button>
						</li>
					))}
				</ul>
			</div>
		</aside>
	)
}