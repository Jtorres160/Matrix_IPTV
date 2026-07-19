import React from 'react';
import { LucideHeart } from 'lucide-react';
import { useProfilesStore } from '../../store/profileStore';

export default function FavoriteButton({ channelId, isFavorite }) {
  const toggleFavorite = useProfilesStore(s => s.toggleFavorite);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(channelId);
  };

  return (
    <button 
      onClick={handleClick}
      data-tv-focusable="true"
      className="p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8B15A]/70 group"
      title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
      aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
    >
      <LucideHeart 
        size={20} 
        className={`transition-all ${
          isFavorite 
            ? 'fill-red-500 text-red-500 scale-110 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]' 
            : 'text-gray-400 group-hover:text-white'
        }`} 
      />
    </button>
  );
}
